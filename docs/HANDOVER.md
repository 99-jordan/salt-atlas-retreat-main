# Salt Atlas Resort Studio — Integration handover

## Wired now

- **Scrape** — `apify/website-content-crawler` via `src/lib/scrape-server.ts` / `src/lib/apify.ts`.
  - Paste start URLs → one bulk Actor run → per-run results + JSON/CSV export.
  - Secrets: `.dev.vars` (local Cloudflare Vite) — see `.dev.vars.example`.
- **Cloudflare storage** — Worker bindings in `wrangler.jsonc`:
  - **R2** `SCRAPE_BUCKET` → raw dataset JSON at `scrapes/{runId}/dataset.json`
  - **D1** `DB` → `scrape_runs` + `scrape_pages` (migration in `drizzle/0001_scrape_storage.sql`)
  - Adapter: `src/lib/scrape-storage-cf.ts` (falls back to in-memory if bindings missing)

### One-time Cloudflare setup

```sh
bunx wrangler login
bunx wrangler r2 bucket create salt-atlas-scrape
bunx wrangler d1 create salt-atlas-scrape
# paste the printed database_id into wrangler.jsonc → d1_databases[0].database_id
bun run db:migrate:local
bun run db:migrate:remote   # when ready for production
cp .dev.vars.example .dev.vars   # add APIFY_TOKEN
bun run dev
```

## Still mocked

- Discover / research gaps / AI edit-section (Claude)
- Publish / rollback (website repo + Cloudflare Pages deploy)
