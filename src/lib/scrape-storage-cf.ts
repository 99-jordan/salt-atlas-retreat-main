import type { ScrapeStorage } from "./scrape-storage";
import { r2DatasetKey } from "./scrape-storage";
import type { ScrapeRunRecord, WccInput, WccPage } from "./wcc-types";

type CfBindings = {
  DB: D1Database;
  SCRAPE_BUCKET: R2Bucket;
};

function pageId(runId: string, url: string, index: number): string {
  return `${runId}_${index}_${hash(url)}`;
}

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

function rowToRun(row: Record<string, unknown>): ScrapeRunRecord {
  const input = JSON.parse(String(row["input_json"])) as WccInput;
  const finishedAt = row["finished_at"] != null ? String(row["finished_at"]) : undefined;
  const datasetId = row["dataset_id"] != null ? String(row["dataset_id"]) : undefined;
  const r2Key = row["r2_key"] != null ? String(row["r2_key"]) : undefined;
  const errorMessage = row["error_message"] != null ? String(row["error_message"]) : undefined;
  return {
    id: String(row["id"]),
    apifyRunId: String(row["apify_run_id"]),
    status: String(row["status"]) as ScrapeRunRecord["status"],
    input,
    startedAt: String(row["started_at"]),
    itemCount: Number(row["item_count"] ?? 0),
    simulated: Number(row["simulated"] ?? 0) === 1,
    ...(finishedAt ? { finishedAt } : {}),
    ...(datasetId ? { datasetId } : {}),
    ...(r2Key ? { r2Key } : {}),
    ...(errorMessage ? { errorMessage } : {}),
  };
}

function rowToPage(row: Record<string, unknown>): WccPage {
  const metadata =
    row["metadata_json"] != null
      ? (JSON.parse(String(row["metadata_json"])) as WccPage["metadata"])
      : undefined;
  const depth = row["depth"] != null ? Number(row["depth"]) : undefined;
  const loadedAt = row["loaded_at"] != null ? String(row["loaded_at"]) : undefined;
  const httpStatus = row["http_status"] != null ? Number(row["http_status"]) : undefined;
  const text = row["text"] != null ? String(row["text"]) : undefined;
  const markdown = row["markdown"] != null ? String(row["markdown"]) : undefined;
  const title = row["title"] != null ? String(row["title"]) : undefined;
  const canonical = row["canonical_url"] != null ? String(row["canonical_url"]) : undefined;

  return {
    url: String(row["url"]),
    ...(text !== undefined ? { text } : {}),
    ...(markdown !== undefined ? { markdown } : {}),
    metadata: {
      ...(metadata ?? {}),
      ...(title !== undefined ? { title } : {}),
      ...(canonical !== undefined ? { canonicalUrl: canonical } : {}),
    },
    crawl: {
      loadedUrl: String(row["url"]),
      ...(loadedAt !== undefined ? { loadedTime: loadedAt } : {}),
      ...(depth !== undefined ? { depth } : {}),
      ...(httpStatus !== undefined ? { httpStatusCode: httpStatus } : {}),
    },
  };
}

export function createCloudflareScrapeStorage(bindings: CfBindings): ScrapeStorage {
  const { DB, SCRAPE_BUCKET } = bindings;

  return {
    async saveRun(run) {
      const key = run.r2Key ?? r2DatasetKey(run.id);
      await DB.prepare(
        `INSERT INTO scrape_runs (
          id, apify_run_id, status, input_json, started_at, finished_at,
          dataset_id, item_count, r2_key, simulated, error_message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          apify_run_id = excluded.apify_run_id,
          status = excluded.status,
          input_json = excluded.input_json,
          started_at = excluded.started_at,
          finished_at = excluded.finished_at,
          dataset_id = excluded.dataset_id,
          item_count = excluded.item_count,
          r2_key = excluded.r2_key,
          simulated = excluded.simulated,
          error_message = excluded.error_message`,
      )
        .bind(
          run.id,
          run.apifyRunId,
          run.status,
          JSON.stringify(run.input),
          run.startedAt,
          run.finishedAt ?? null,
          run.datasetId ?? null,
          run.itemCount,
          key,
          run.simulated ? 1 : 0,
          run.errorMessage ?? null,
        )
        .run();
    },

    async updateRun(id, patch) {
      const cur = await this.getRun(id);
      if (!cur) return undefined;
      const next: ScrapeRunRecord = { ...cur, ...patch };
      if (patch.r2Key === undefined && cur.r2Key) next.r2Key = cur.r2Key;
      await this.saveRun(next);
      return next;
    },

    async getRun(id) {
      const row = await DB.prepare(`SELECT * FROM scrape_runs WHERE id = ?`).bind(id).first();
      return row ? rowToRun(row as Record<string, unknown>) : undefined;
    },

    async listRuns() {
      const { results } = await DB.prepare(
        `SELECT * FROM scrape_runs ORDER BY started_at DESC LIMIT 100`,
      ).all();
      return (results ?? []).map((r) => rowToRun(r as Record<string, unknown>));
    },

    async savePages(runId, pages) {
      const key = r2DatasetKey(runId);
      await SCRAPE_BUCKET.put(key, JSON.stringify(pages), {
        httpMetadata: { contentType: "application/json" },
        customMetadata: { runId },
      });

      await DB.prepare(`UPDATE scrape_runs SET r2_key = ?, item_count = ? WHERE id = ?`)
        .bind(key, pages.length, runId)
        .run();

      await DB.prepare(`DELETE FROM scrape_pages WHERE run_id = ?`).bind(runId).run();

      // Batch inserts (D1 limit ~100 bound params; keep batches small)
      const chunk = 20;
      for (let i = 0; i < pages.length; i += chunk) {
        const slice = pages.slice(i, i + chunk);
        const stmts = slice.map((p, j) =>
          DB.prepare(
            `INSERT INTO scrape_pages (
              id, run_id, url, canonical_url, title, depth, loaded_at,
              http_status, text, markdown, metadata_json, resort_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).bind(
            pageId(runId, p.url, i + j),
            runId,
            p.url,
            p.metadata?.canonicalUrl ?? null,
            p.metadata?.title ?? null,
            p.crawl?.depth ?? null,
            p.crawl?.loadedTime ?? null,
            p.crawl?.httpStatusCode ?? null,
            p.text ?? null,
            p.markdown ?? null,
            p.metadata ? JSON.stringify(p.metadata) : null,
            null,
          ),
        );
        await DB.batch(stmts);
      }
    },

    async getPages(runId) {
      // Prefer R2 raw blob (full fidelity); fall back to D1 rows.
      const run = await this.getRun(runId);
      const key = run?.r2Key ?? r2DatasetKey(runId);
      const obj = await SCRAPE_BUCKET.get(key);
      if (obj) {
        try {
          return (await obj.json()) as WccPage[];
        } catch {
          /* fall through */
        }
      }
      const { results } = await DB.prepare(
        `SELECT * FROM scrape_pages WHERE run_id = ? ORDER BY depth ASC, url ASC`,
      )
        .bind(runId)
        .all();
      return (results ?? []).map((r) => rowToPage(r as Record<string, unknown>));
    },
  };
}
