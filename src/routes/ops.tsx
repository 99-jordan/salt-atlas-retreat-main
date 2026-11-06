import { checkPage } from "@/lib/crawl-policy";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Panel, PageHeader, Mono, Pill } from "@/components/studio/ui-bits";
import { mutate, mutateResort, useStudio } from "@/lib/store";
import { createScrapeRun, fetchScrapeRun, fetchScrapeRunItems, sleep } from "@/lib/api";
import { DEFAULT_WCC_INPUT } from "@/lib/wcc-types";
import { newPage } from "@/lib/page-gen";
import { canGenerate, completeness } from "@/lib/workflow";
import {
  ApprovalRequired, activeCompetitors, applyWrittenSections, blankFacts,
  discoveredResorts, invokeAgent, mergeVerifiedResearch,
} from "@/lib/agents/agent-client";
import type { Resort } from "@/lib/types";

export const Route = createFileRoute("/ops")({
  component: Operations,
  head: () => ({ meta: [{ title: "CEO orchestration — Salt Atlas Resort Studio" }] }),
});

type Step = "scout" | "scrape" | "review" | "write";
const TERMINAL = new Set(["SUCCEEDED", "FAILED", "TIMED-OUT", "ABORTED"]);
function Operations() {
  const { competitors, resorts, discoveryResults } = useStudio();
  const nav = useNavigate();
  const [instruction, setInstruction] = useState("Find high-fit surf resorts and trace official websites. Prioritise authentic waves, prices and accommodation.");
  const [country, setCountry] = useState("Indonesia");
  const [region, setRegion] = useState("Mentawai Islands");
  const [selected, setSelected] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ step: Step; estimate: number } | null>(null);
  const [spend, setSpend] = useState(0);
  const [activity, setActivity] = useState<string[]>(["CEO ready. Start Scout, then check identity before a crawl."]);
  const current = resorts.find((r) => r.id === selected);
  const add = (line: string) => setActivity((prev) => [...prev, `${new Date().toLocaleTimeString()} · ${line}`]);
  const record = (usage: { actualCostGbp?: number; estimatedCostGbp: number }) => {
    setSpend((prev) => prev + (usage.actualCostGbp ?? usage.estimatedCostGbp));
  };
  async function run(step: Step, approveOverBudget = false) {
    if (busy) return;
    setPending(null); setBusy(true);
    try {
      if (step === "scout") {
        add("Scout: seeking competitor listings and official source candidates…");
        const input = {
          country, region, instruction, competitors: activeCompetitors(competitors, competitors.map((c) => c.id)),
          knownResortNames: resorts.map((r) => r.name),
        };
        const result = await invokeAgent({ kind: "scout", input, approveOverBudget });
        record(result.usage);
        const found = discoveredResorts(result.data, input);
        mutate((s) => { s.discoveryResults = found; });
        add(`Scout found ${found.length} candidates. Check identity evidence and choose a resort to queue.`);
        for (const warning of result.warnings) add(warning);
      }
      if (step === "scrape") {
        if (!current) throw new Error("Select a queued resort first.");
        if (current.stage !== "scrape") throw new Error("This resort is not in the scrape queue.");
        const urls = [...new Set(current.sources.filter((s) => s.selected).map((s) => s.url))];
        if (!urls.length) throw new Error("No selected URLs for this resort.");
        add(`Apify: crawling ${urls.length} selected pages, depth 0, concurrency 1.`);
        const started = await createScrapeRun({
          ...DEFAULT_WCC_INPUT, startUrls: urls.map((url) => ({ url })),
          maxCrawlDepth: 0, maxCrawlPages: urls.length, maxResults: urls.length,
          initialConcurrency: 1, maxConcurrency: 1, maxRequestRetries: 1,
          useSitemaps: false, respectRobotsTxtFile: true,
        });
        let finished = started;
        for (let i = 0; !TERMINAL.has(finished.status) && i < 80; i++) {
          await sleep(2500);
          finished = await fetchScrapeRun(started.id);
        }
        if (!TERMINAL.has(finished.status)) throw new Error("Crawl is still running. Reopen Scrape to inspect the saved run.");
        if (finished.status !== "SUCCEEDED") throw new Error(`Apify ${finished.status}; see Runs for details.`);
        const pages = await fetchScrapeRunItems(finished.id);
        const usable = pages.filter((p) => checkPage(p) === "usable");
        if (!usable.length) throw new Error("No usable content returned. Keep the resort queued and find another source.");
        mutateResort(current.id, (r) => {
          for (const src of r.sources) {
            if (!urls.includes(src.url)) continue;
            src.runId = finished.id;
            src.scrape = usable.some((p) => p.url === src.url || p.url.startsWith(src.url.replace(/\/$/, "") + "/")) ? "completed" : "failed";
            src.extractedAt = new Date().toISOString();
          }
          r.facts = blankFacts(r.id);
          r.exclusivity.status = "needs_review";
          r.stage = "research";
          r.researchLog.push(`Apify run ${finished.id} returned ${usable.length} usable pages. No facts verified yet.`);
        });
        add(`Apify: ${usable.length} usable pages stored. Reviewer is ready.`);
      }
      if (step === "review") {
        if (!current || current.stage !== "research") throw new Error("Select a resort in Research.");
        const runIds = [...new Set(current.sources.map((s) => s.runId).filter((id): id is string => !!id))];
        if (!runIds.length) throw new Error("No linked Apify run; scrape the resort first.");
        const pages = (await Promise.all(runIds.map(fetchScrapeRunItems))).flat();
        const allowed = current.sources.map((s) => s.url.replace(/\/$/, ""));
        const matched = pages.filter((p) => allowed.some((u) => p.url.replace(/\/$/, "") === u || p.url.startsWith(u + "/")));
        if (!matched.length) throw new Error("No scraped evidence found for this resort.");
        add(`Reviewer: comparing ${matched.length} source pages against required template facts…`);
        const result = await invokeAgent({ kind: "reviewer", input: { resort: current, pages: matched }, approveOverBudget });
        record(result.usage);
        mutateResort(current.id, (r) => {
          const outcome = mergeVerifiedResearch(r, result.data, matched);
          for (const url of outcome.suggestedSources) {
            if (!r.sources.some((s) => s.url === url)) r.sources.push({
              id: `suggested-${crypto.randomUUID()}`, url, type: "independent", selected: false, scrape: "pending",
            });
          }
          r.researchLog.push(...result.warnings);
        });
        add("Reviewer finished. Check conflicts, gap URLs and exclusivity evidence before drafting.");
      }
      if (step === "write") {
        if (!current || current.stage !== "research") throw new Error("Select a reviewed resort.");
        if (current.exclusivity.status !== "clear") throw new Error("CEO must clear exclusivity with evidence before writing.");
        if (!canGenerate(current)) throw new Error("Research needs at least 60% verified fields and no conflicts.");
        const provisional = newPage(current);
        add("Writer: generating structured copy in existing template fields…");
        const result = await invokeAgent({ kind: "writer", input: { resort: current, sections: provisional.sections }, approveOverBudget });
        record(result.usage);
        mutateResort(current.id, (r) => {
          r.page = newPage(r);
          const written = applyWrittenSections(r, result.data);
          r.page!.versions[0]!.sections = structuredClone(r.page!.sections);
          r.stage = "generate";
          r.researchLog.push(`Writer updated ${written.length} supported sections. Human approval required.`);
          r.researchLog.push(...result.warnings);
        });
        add("Writer finished. Open the page editor for preview and publication checks.");
      }
    } catch (err) {
      if (err instanceof ApprovalRequired) {
        setPending({ step, estimate: err.estimatedCostGbp });
        add(`Spend approval needed: £${err.estimatedCostGbp.toFixed(3)} estimate exceeds £0.10 per Claude call.`);
      } else {
        const message = err instanceof Error ? err.message : String(err);
        add(`Stopped: ${message}`);
        toast.error(message);
      }
    } finally { setBusy(false); }
  }
  function queue(candidate: Resort) {
    if (resorts.some((r) => r.name.toLowerCase() === candidate.name.toLowerCase())) {
      toast.error("This resort may already exist; compare its identity before merging."); return;
    }
    const id = candidate.id.replace(/^d-/, "");
    mutate((s) => {
      s.resorts.push({
        ...structuredClone(candidate), id, stage: "scrape", facts: blankFacts(id),
        sources: candidate.sources.map((src) => ({ ...src, id: src.id.replace(candidate.id, id) })),
      });
      s.discoveryResults = s.discoveryResults.filter((r) => r.id !== candidate.id);
    });
    setSelected(id);
    add(`Queued ${candidate.name}. Apify can now retrieve only its selected URLs.`);
  }
  function decide(status: "clear" | "blocked") {
    if (!current) return;
    if (reviewNote.trim().length < 12) { toast.error("Record a specific evidence-based reason (at least 12 characters)."); return; }
    mutateResort(current.id, (r) => {
      r.exclusivity.status = status;
      r.exclusivity.confirmedBy = "Human editor";
      r.exclusivity.evidence.push({ note: reviewNote.trim(), sourceType: "salt_atlas" });
      r.researchLog.push(`CEO ${status} exclusivity: ${reviewNote.trim()}`);
    });
    setReviewNote(""); add(`Exclusivity marked ${status} by human editor.`);
  }
  return (
    <div className="mx-auto max-w-[1480px] px-5 py-8 md:px-8">
      <PageHeader eyebrow="CEO · Orchestration" title="Agent operations"
        crumbs={[{ label: "Overview", to: "/" }, { label: "CEO" }]}
        description="One control surface for Scout → Apify → Reviewer → HTML Writer. Source review and cost approval remain human decisions." />
      <div className="grid gap-4 xl:grid-cols-[340px_1fr_300px]">
        <Panel className="h-fit space-y-3 p-4">
          <div className="font-semibold">CEO instruction</div>
          <Textarea rows={4} value={instruction} onChange={(e) => setInstruction(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <Input value={country} onChange={(e) => setCountry(e.target.value)} aria-label="Country" placeholder="Country" />
            <Input value={region} onChange={(e) => setRegion(e.target.value)} aria-label="Region" placeholder="Region" />
          </div>
          <Button className="w-full" disabled={busy} onClick={() => void run("scout")}>1 · Discover sources</Button>
          <div className="border-t pt-3">
            <div className="mb-2 text-sm font-semibold">Discovered candidates</div>
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {discoveryResults.map((candidate) => (
                <div key={candidate.id} className="rounded-lg border p-2 text-xs">
                  <div className="font-semibold">{candidate.name}</div>
                  <div className="mt-1 text-muted-foreground">{candidate.identityNote}</div>
                  <div className="mt-1 text-muted-foreground">{candidate.sources.length} source URLs · {candidate.competitors.length} competitors</div>
                  <Button className="mt-2" size="sm" variant="outline" onClick={() => queue(candidate)} disabled={busy || candidate.knownBefore}>Identity checked — queue</Button>
                </div>
              ))}
              {!discoveryResults.length && <p className="text-xs text-muted-foreground">Run Scout to populate candidate resorts.</p>}
            </div>
          </div>
        </Panel>
        <div className="space-y-4">
          <Panel className="space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-semibold">Current resort</div>
              <select className="max-w-full rounded-md border bg-card px-3 py-2 text-sm" value={selected} onChange={(e) => setSelected(e.target.value)}>
                <option value="">Choose a resort</option>
                {resorts.map((r) => <option key={r.id} value={r.id}>{r.name} · {r.stage}</option>)}
              </select>
            </div>
            {current ? <>
              <div className="text-lg font-semibold">{current.name}</div>
              <div className="flex flex-wrap gap-2">
                {(["discover", "scrape", "research", "generate"] as const).map((stage, i) =>
                  <Pill key={stage} tone={current.stage === stage ? "info" : "muted"}>{i + 1} {stage}</Pill>)}
              </div>
              <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/50 p-3 text-center text-xs">
                <div><div className="font-semibold">{current.sources.length}</div>Sources</div>
                <div><div className="font-semibold">{completeness(current)}%</div>Verified fields</div>
                <div><div className="font-semibold">{current.exclusivity.status}</div>Exclusivity</div>
              </div>
              {current.stage === "scrape" && <Button disabled={busy} onClick={() => void run("scrape")}>2 · Crawl selected URLs</Button>}
              {current.stage === "research" && <div className="flex flex-wrap gap-2">
                <Button disabled={busy} onClick={() => void run("review")}>3 · Verify scraped facts</Button>
                <Button variant="outline" disabled={busy || !canGenerate(current) || current.exclusivity.status !== "clear"} onClick={() => void run("write")}>4 · Generate HTML</Button>
              </div>}
              {(current.stage === "generate" || current.stage === "published") && <Button onClick={() => nav({ to: "/studio", search: { resort: current.id } })}>Open HTML editor</Button>}
              <div className="text-sm font-semibold">Current evidence</div>
              <div className="max-h-[400px] space-y-2 overflow-y-auto">
                {current.facts.map((fact) => (
                  <div key={fact.id} className="rounded-md border px-3 py-2 text-xs">
                    <div className="flex items-center justify-between"><span className="font-semibold">{fact.label}</span><span>{fact.status}</span></div>
                    <div className="mt-1">{fact.selected ?? "Missing — research needed"}</div>
                    {fact.selectedCandidateId && <Mono className="text-muted-foreground">{fact.candidates.find((c) => c.id === fact.selectedCandidateId)?.sourceUrl ?? ""}</Mono>}
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={() => nav({ to: "/research", search: { resort: current.id } })}>Open detailed research</Button>
            </> : <p className="text-sm text-muted-foreground">Pick a resort from the candidates or existing records.</p>}
          </Panel>
          <Panel className="p-4">
            <div className="mb-3 font-semibold">Live stage stream</div>
            <div className="max-h-[290px] space-y-1 overflow-y-auto font-mono text-xs">
              {activity.map((line, i) => <p key={i} className="border-l-2 border-primary/30 py-1 pl-3">{line}</p>)}
            </div>
          </Panel>
        </div>
        <Panel className="h-fit space-y-4 p-4">
          <div className="font-semibold">Approvals and spend</div>
          <div className="rounded-lg bg-muted/50 p-3">
            <div className="text-xs text-muted-foreground">Claude cost in this workspace session</div>
            <div className="text-2xl font-semibold">£{spend.toFixed(3)}</div>
            <Mono>£0.10 pre-call approval threshold</Mono>
          </div>
          {pending && <div className="rounded-lg border border-amber-500/60 p-3 text-sm">
            <div className="font-semibold">Approval required</div>
            <p>Estimated £{pending.estimate.toFixed(3)} for {pending.step}. No Claude call was made.</p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" disabled={busy} onClick={() => void run(pending.step, true)}>Approve</Button>
              <Button size="sm" variant="outline" onClick={() => setPending(null)}>Reject</Button>
            </div>
          </div>}
          {current?.stage === "research" && <div className="space-y-2 border-t pt-3">
            <div className="font-semibold">Exclusivity cross-check</div>
            <Pill tone={current.exclusivity.status === "clear" ? "ok" : current.exclusivity.status === "blocked" ? "bad" : "warn"}>{current.exclusivity.status}</Pill>
            {current.exclusivity.evidence.map((e, i) => <div key={i} className="text-xs text-muted-foreground">
              {e.note} {e.url && <a href={e.url} target="_blank" rel="noreferrer" className="underline">Evidence</a>}
            </div>)}
            <Textarea rows={3} value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} placeholder="Human decision and evidence supporting it…" />
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={busy} onClick={() => decide("clear")}>Mark clear</Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => decide("blocked")}>Block</Button>
            </div>
          </div>}
          <p className="text-xs text-muted-foreground">AI does not approve publishing, verify photograph rights, or override human exclusivity decisions. Live deployment remains separate.</p>
        </Panel>
      </div>
    </div>
  );
}
