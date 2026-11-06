import type { Candidate, Fact, Resort, SourceUrl, PageSection, Competitor } from "../types";
import { slugify, FIELD_SPECS } from "../mock-data";
import type { AgentRequest, DiscoverInput } from "./contracts";
import { discoverySchema, reviewSchema, writerSchema, editSchema } from "./contracts";
import { executeAgent } from "./agent-server";
import type { WccPage } from "../wcc-types";
import { SOURCE_RANK } from "./contracts";

export type AgentReply = Awaited<ReturnType<typeof executeAgent>>;
export class ApprovalRequired extends Error {
  constructor(public readonly estimatedCostGbp: number, public readonly kind: string) {
    super(`${kind} requires approval: estimated £${estimatedCostGbp.toFixed(3)} exceeds £0.10`);
  }
}
export async function invokeAgent(req: AgentRequest) {
  const reply = await executeAgent({ data: req });
  if (reply.state === "approval_required") throw new ApprovalRequired(reply.estimatedCostGbp, reply.kind);
  return reply;
}
const canonical = (s: string) => { try { const u = new URL(s); u.hash = ""; u.search = ""; return u.toString().replace(/\/$/, ""); } catch { return s; } };

export function discoveredResorts(raw: unknown, input: DiscoverInput): Resort[] {
  const data = discoverySchema.parse(raw);
  const date = new Date().toISOString();
  return data.resorts.map((entry, i) => {
    const id = `d-${slugify(entry.name)}-${i}`;
    const urls = [
      ...entry.competitorUrls.map((x) => ({ url: x.url, type: "competitor" as const, competitorId: x.competitorId })),
      ...(entry.officialUrl ? [{ url: entry.officialUrl, type: "official" as const }] : []),
      ...entry.otherSources.map((url) => ({ url, type: "independent" as const })),
    ];
    const seen = new Set<string>();
    const sources: SourceUrl[] = urls.filter((x) => {
      const key = canonical(x.url);
      if (seen.has(key)) return false; seen.add(key); return true;
    }).map((x, j) => ({
      id: `${id}-source-${j}`, url: x.url, type: x.type,
      ...("competitorId" in x && x.competitorId ? { competitorId: x.competitorId } : {}),
      selected: true, scrape: "pending",
    }));
    return {
      id, name: entry.name, region: input.region, country: input.country,
      destination: `${input.region}, ${input.country}`, stage: "discover",
      ...(entry.officialUrl ? { officialUrl: entry.officialUrl } : {}),
      identityNote: `${entry.identityEvidence} ${entry.needsIdentityReview ? "Identity review required." : ""}`.trim(),
      competitors: [...new Set(entry.competitorUrls.map((x) => x.competitorId))],
      knownBefore: input.knownResortNames.some((n) => n.toLowerCase() === entry.name.toLowerCase()),
      sources, facts: blankFacts(id),
      exclusivity: { status: "needs_review", evidence: [{ note: "No direct evidence of non-exclusivity yet.", sourceType: "independent" }] },
      researchLog: [`Discovered ${date}. Source URLs must be crawled and identity verified.`],
    } satisfies Resort;
  });
}
export function blankFacts(id: string): Fact[] {
  return FIELD_SPECS.map((f) => ({
    id: `${id}-${f.key}`, label: f.label, category: f.category,
    templateField: f.templateField, candidates: [], status: "missing" as const,
    reason: "Awaiting source-backed extraction.",
  }));
}
export function ensureResearchFacts(resort: Resort): void {
  if (!resort.facts.length) resort.facts = blankFacts(resort.id);
}
export function mergeVerifiedResearch(resort: Resort, raw: unknown, pages: WccPage[]) {
  const response = reviewSchema.parse(raw);
  ensureResearchFacts(resort);
  const allowed = new Map(pages.map((p) => [canonical(p.url), (p.markdown ?? p.text ?? "").toLowerCase()]));
  const now = new Date().toISOString();
  const applied: string[] = [];
  for (const item of response.facts) {
    const f = resort.facts.find((f) => f.id === item.factId);
    const haystack = allowed.get(canonical(item.sourceUrl));
    if (!f || !haystack?.includes(item.sourceQuote.toLowerCase())) continue;
    const candidate: Candidate = {
      id: `ai-${crypto.randomUUID()}`, value: item.value, sourceUrl: item.sourceUrl,
      sourceType: resort.sources.find((s) => canonical(s.url) === canonical(item.sourceUrl))?.type ?? "independent",
      checkedAt: now, quote: item.sourceQuote,
    };
    if (f.candidates.some((c) => c.value === candidate.value && canonical(c.sourceUrl) === canonical(candidate.sourceUrl))) continue;
    f.candidates.push(candidate);
    const active = f.candidates.filter((c) => !c.rejected);
    const distinct = new Set(active.map((c) => c.value.trim().toLowerCase()));
    if (distinct.size > 1) {
      f.status = "conflict"; f.selected = undefined; f.selectedCandidateId = undefined;
      f.reason = "Multiple incompatible source values need review.";
    } else {
      const winner = [...active].sort((a, b) => SOURCE_RANK[a.sourceType] - SOURCE_RANK[b.sourceType])[0];
      if (winner) {
        f.selected = winner.value; f.selectedCandidateId = winner.id;
        f.status = winner.sourceType === "official" || winner.sourceType === "resort_owned" ? "verified" : "single";
        f.reason = item.reasoning;
      }
    }
    applied.push(f.id);
  }
  const ex = response.exclusivity;
  // A model cannot clear exclusivity by itself. A human checks the decision.
  resort.exclusivity = {
    status: ex.status === "blocked" ? "needs_review" : ex.status === "clear" ? "needs_review" : ex.status,
    evidence: [...resort.exclusivity.evidence, {
      note: `AI recommendation (${ex.status}): ${ex.reasoning}`,
      ...(ex.sourceUrl ? { url: ex.sourceUrl } : {}),
      sourceType: ex.sourceUrl ? resort.sources.find((s) => canonical(s.url) === canonical(ex.sourceUrl))?.type ?? "independent" : "independent",
    }],
  };
  resort.researchLog.push(`Reviewer processed ${applied.length} evidenced facts; ${response.additionalSourceUrls.length} suggested follow-up sources.`);
  return { applied, suggestedSources: response.additionalSourceUrls, exclusivitySuggestion: ex, readyToDraft: response.readyToDraft };
}
export function applyWrittenSections(resort: Resort, raw: unknown): string[] {
  if (!resort.page) return [];
  const response = writerSchema.parse(raw);
  const allowed = new Map(resort.page.sections.map((s) => [s.id, s]));
  const changed: string[] = [];
  for (const item of response.sections) {
    const s = allowed.get(item.sectionId);
    if (!s) continue;
    const valid = item.usedFactIds.length > 0 && item.usedFactIds.every((id) =>
      s.factIds.includes(id) && resort.facts.some((f) => f.id === id && f.selected && ["verified", "single"].includes(f.status)));
    if (!valid) continue;
    s.title = item.title; s.body = item.body; changed.push(s.id);
  }
  return changed;
}
export function applyEditorPatch(section: PageSection, raw: unknown): Pick<PageSection, "title" | "body"> {
  const patch = editSchema.parse(raw);
  if (patch.sectionId !== section.id) throw new Error("AI patch does not target the selected section");
  return { title: patch.title, body: patch.body };
}
export function activeCompetitors(all: Competitor[], ids: string[]) {
  return all.filter((c) => ids.includes(c.id));
}
