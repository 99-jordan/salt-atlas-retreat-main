# Salt Atlas — CEO agent pipeline

This branch implements the **first server-side agent wiring** on top of the existing TanStack Start + Apify + Cloudflare code. The existing four detailed pages remain intact. The new `/ops` page provides one human-supervised command surface.

## Agent roles and handoffs

| Role | Entry point | Output | Guard |
| --- | --- | --- | --- |
| Scout | `executeAgent({kind:"scout"})` | Candidates, planned competitor and official source URLs | Google Search / Places evidence only; human checks identity |
| Apify crawler | `createScrapeRun` | Dataset in R2/D1 with per-URL content | Not Claude; actual WCC actor; no fabricated extraction |
| Reviewer | `executeAgent({kind:"reviewer"})` | Source-quoted fact candidates, gaps, exclusivity recommendation | Match quote to saved scraped text; human exclusivity decision |
| HTML Writer | `executeAgent({kind:"writer"})` | JSON title/body per existing section ID | Uses selected facts; section IDs and fact IDs validated |
| Visual editor | `executeAgent({kind:"editor"})` | Single-section title/body patch | Human accepts; layout/HTML/CSS untouched |

The CEO is an orchestrator, **not another scraper**. Its controls call the same operations used by the detailed pages.

## How to use

1. Copy `.dev.vars.example` to `.dev.vars`; set server secrets there, **never in frontend env variables**.
2. Keep `ENABLE_LIVE_AGENT_CALLS=false` until you have protected the deployment with a real access boundary (Cloudflare Access or equivalent). Otherwise an anonymous visitor could incur paid Claude and search charges.
3. Set `ANTHROPIC_API_KEY` and a search source: `GOOGLE_SEARCH_API_KEY` + `GOOGLE_SEARCH_CX` and/or `GOOGLE_PLACES_API_KEY`.
4. After access is secured, set `ENABLE_LIVE_AGENT_CALLS=true`. Set `APIFY_TOKEN` separately for live scraping.
5. Open `/ops` to Scout candidates, confirm the resort identity, crawl with Apify, review citations, resolve exclusivity, then generate a section-mapped draft. Open Studio for manual and AI edits.

All Claude operations have a **£0.10 estimated per-call preflight review threshold**. Higher estimates require explicit approval in the UI; this is **not a guaranteed hard billing cap**, because input token estimation and exchange rates are approximate, and Google search and Apify usage are separately billed.

## Evidence safeguards

- Scout only returns URLs found in search/Places results; candidates are not treated as verified resort identities.
- Scrape → Research now creates **blank template fields**, not fictional example facts.
- Reviewer fact additions require a real matching source URL and a quote actually appearing in saved Apify content.
- Claude's exclusivity recommendation remains **Needs review** until a human records a decision.
- Writer may only edit existing template section IDs using selected referenced fact IDs.
- Editor returns a proposed patch for one section only. Direct visual edits remain AI-free.
- Current public-site publishing continues to be **simulated**; no GitHub or Cloudflare deployment call is triggered by the UI.

## Not yet production-ready

- A durable Cloudflare Workflow with retries/webhooks for long-running operations. Currently `/ops` coordinates on the client and resets on page reload.
- A true per-domain Durable Object crawl gate with daily budgets, spacing, and lock control. The `/ops` flow uses conservative WCC options, but the existing manual WCC form is still configurable.
- Persistent research facts, decisions, approvals and agent traces in D1. Apify datasets/runs already have D1 + R2 adapters.
- Independent second-pass claim/originality check on Writer output, plus approved photo library and exact production HTML template files.
- Real repository publishing and rollback. The existing Studio uses a provisional page template.
- Robust real-world API smoke tests with valid service credentials and a secured environment. Do not mistake seeded UI demo records for verified resort data.

## Main code

- `src/lib/agents/contracts.ts`: input/output contracts.
- `src/lib/agents/agent-server.ts`: server-only Claude and Google integration, validation, cost preflight.
- `src/lib/agents/agent-client.ts`: source-ranked mappings into existing Resort, Fact and PageSection types.
- `src/routes/ops.tsx`: CEO control surface.
- `src/routes/discover.tsx`, `research.tsx`, `studio.tsx`: direct page hooks.

## Data safety

The source text returned from competitor pages is untrusted. The agents are instructed to treat it solely as evidence. Do not expose any server keys in the browser. Do not enable paid endpoints on an unauthenticated public deployment.
