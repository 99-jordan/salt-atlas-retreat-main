import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { useStudio } from "@/lib/store";
import { STAGES, nextAction, openIssues, stageIndex, verificationLabel } from "@/lib/workflow";
import { Mono, PageHeader, Panel, Pill, STAGE_LABEL } from "@/components/studio/ui-bits";
import { COMPETITORS } from "@/lib/mock-data";
import { IMG } from "@/lib/images";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Overview — Salt Atlas Resort Studio" },
      { name: "description", content: "Track surf resorts from competitor discovery to published Salt Atlas pages." },
      { property: "og:title", content: "Salt Atlas Resort Studio" },
      { property: "og:description", content: "Discover, scrape, verify and publish surf resort pages." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Overview,
});

function Overview() {
  const { resorts, discoveryResults } = useStudio();
  const [q, setQ] = useState("");
  const nav = useNavigate();
  const rows = useMemo(() => resorts.filter((r) => `${r.name} ${r.destination}`.toLowerCase().includes(q.toLowerCase())), [resorts, q]);
  const pageStatus = (s: string) => resorts.filter((r) => r.page?.status === s).length;
  const stats = [
    { label: "Discovered resorts", v: resorts.length + discoveryResults.length },
    { label: "Awaiting scrape", v: resorts.filter((r) => r.stage === "scrape").length },
    { label: "In research", v: resorts.filter((r) => r.stage === "research").length },
    { label: "Ready for HTML", v: resorts.filter((r) => r.stage === "generate" && !r.page).length + resorts.filter((r) => r.stage === "research" && r.facts.length && r.facts.every(f => f.status !== "conflict")).length },
    { label: "Drafts in review", v: pageStatus("draft") + pageStatus("review") + pageStatus("approved") },
    { label: "Published pages", v: pageStatus("live") },
  ];

  return (
    <div className="mx-auto max-w-[1320px] px-5 py-8 md:px-10 md:py-10">
      <section className="relative mb-10 overflow-hidden rounded-2xl bg-deep text-shell">
        <img src={IMG.wave} alt="" className="absolute inset-0 h-full w-full object-cover opacity-45" width={1600} height={912} />
        <div className="absolute inset-0 bg-gradient-to-r from-deep via-deep/80 to-transparent" />
        <div className="relative px-7 py-10 md:px-12 md:py-14">
          <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-sky">Resort Studio · Friday</div>
          <h1 className="mt-3 max-w-xl text-3xl font-semibold leading-tight tracking-tight md:text-[2.6rem]">From competitor listings to verified Salt Atlas pages.</h1>
          <p className="mt-3 max-w-lg text-[15px] text-shell/70">Four connected stages. Every fact keeps its source. Nothing publishes without approval.</p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link to="/discover" className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">Start a discovery <ArrowRight className="size-4" /></Link>
            <Link to="/studio" search={{ resort: "anchor" }} className="inline-flex items-center gap-2 rounded-lg bg-shell/10 px-4 py-2.5 text-sm font-medium text-shell ring-1 ring-shell/20 hover:bg-shell/15">1 live page needs a price update</Link>
          </div>
        </div>
      </section>

      <div className="mb-10 grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border md:grid-cols-3 xl:grid-cols-6">
        {stats.map((s) => (
          <div key={s.label} className="bg-card px-5 py-5">
            <div className="font-mono text-3xl font-medium tracking-tight">{s.v}</div>
            <div className="mt-1 text-[12.5px] text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="eyebrow mb-3">Pipeline</div>
      <div className="mb-12 grid gap-3 md:grid-cols-4">
        {STAGES.map((st, i) => {
          const items = resorts.filter((r) => stageIndex(r.stage) === i || (i === 3 && r.stage === "published"));
          return (
            <Link key={st.id} to={st.to} className="group relative rounded-xl border bg-card p-5 shadow-soft transition hover:-translate-y-0.5 hover:border-primary/40">
              <div className="flex items-center justify-between">
                <Mono className="text-muted-foreground">{st.short}</Mono>
                <ArrowRight className="size-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
              </div>
              <div className="mt-6 font-semibold">{st.label}</div>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {items.length === 0 && <span className="text-xs text-muted-foreground">Nothing here yet</span>}
                {items.map((r) => (
                  <span key={r.id} title={r.name} className={cn("h-2 w-7 rounded-full", r.stage === "published" ? "bg-success" : "bg-primary/70")} />
                ))}
              </div>
              <div className="mt-2 text-xs text-muted-foreground">{items.length} resort{items.length === 1 ? "" : "s"}</div>
              {i < 3 && <div className="absolute -right-2 top-1/2 hidden h-px w-4 bg-border md:block" />}
            </Link>
          );
        })}
      </div>

      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <PageHeader title="Resorts" description="Click a resort to open it at its current stage." />
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search resorts or destinations" className="bg-card pl-9" />
        </div>
      </div>
      <Panel className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-sm">
          <thead>
            <tr className="border-b text-left">
              {["Resort", "Competitor sources", "Stage", "Verification", "Outstanding", "Next action"].map((h) => (
                <th key={h} className="eyebrow px-5 py-3 font-normal">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const na = nextAction(r);
              const issues = openIssues(r);
              return (
                <tr key={r.id} onClick={() => nav({ to: na.to, search: { resort: r.id } })} className="cursor-pointer border-b last:border-0 transition-colors hover:bg-muted/50">
                  <td className="px-5 py-4">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-muted-foreground">{r.destination}</div>
                  </td>
                  <td className="px-5 py-4 text-xs text-muted-foreground">{r.competitors.map((c) => COMPETITORS.find((x) => x.id === c)?.name).join(", ")}</td>
                  <td className="px-5 py-4"><StageDots i={stageIndex(r.stage)} label={STAGE_LABEL[r.stage]} /></td>
                  <td className="px-5 py-4"><Mono>{verificationLabel(r)}</Mono></td>
                  <td className="px-5 py-4">
                    <div className="flex flex-wrap gap-1">{issues.length ? issues.slice(0, 2).map((i) => <Pill key={i} tone={i.includes("blocked") || i.includes("conflict") || i.includes("failed") ? "bad" : "warn"}>{i}</Pill>) : <Pill tone="ok">None</Pill>}</div>
                  </td>
                  <td className="px-5 py-4"><span className="inline-flex items-center gap-1 text-[13px] font-medium text-primary">{na.label}<ArrowRight className="size-3.5" /></span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

function StageDots({ i, label }: { i: number; label: string }) {
  return (
    <div>
      <div className="flex gap-1">{[0, 1, 2, 3].map((k) => <span key={k} className={cn("h-1.5 w-5 rounded-full", k < i || i === 4 ? "bg-success" : k === i ? "bg-primary" : "bg-mist dark:bg-muted")} />)}</div>
      <div className="mt-1.5 text-xs">{label}</div>
    </div>
  );
}
