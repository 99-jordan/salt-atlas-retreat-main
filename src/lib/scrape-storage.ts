/**
 * Scrape persistence ports.
 *
 * Production: Cloudflare R2 (raw dataset JSON) + D1 (scrape_runs / scrape_pages).
 * Fallback: in-memory local adapter when bindings are missing or D1 is unusable.
 */
import { env } from "cloudflare:workers";
import type { ScrapeRunRecord, WccPage } from "./wcc-types";
import { createCloudflareScrapeStorage } from "./scrape-storage-cf";

export interface ScrapeStorage {
  saveRun(run: ScrapeRunRecord): Promise<void>;
  updateRun(id: string, patch: Partial<ScrapeRunRecord>): Promise<ScrapeRunRecord | undefined>;
  getRun(id: string): Promise<ScrapeRunRecord | undefined>;
  listRuns(): Promise<ScrapeRunRecord[]>;
  savePages(runId: string, pages: WccPage[]): Promise<void>;
  getPages(runId: string): Promise<WccPage[]>;
}

export function r2DatasetKey(runId: string): string {
  return `scrapes/${runId}/dataset.json`;
}

const runs = new Map<string, ScrapeRunRecord>();
const pages = new Map<string, WccPage[]>();

export const localScrapeStorage: ScrapeStorage = {
  async saveRun(run) {
    runs.set(run.id, structuredClone(run));
  },
  async updateRun(id, patch) {
    const cur = runs.get(id);
    if (!cur) return undefined;
    const next = { ...cur, ...patch };
    runs.set(id, next);
    return structuredClone(next);
  },
  async getRun(id) {
    const r = runs.get(id);
    return r ? structuredClone(r) : undefined;
  },
  async listRuns() {
    return [...runs.values()]
      .map((r) => structuredClone(r))
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  },
  async savePages(runId, items) {
    pages.set(runId, structuredClone(items));
  },
  async getPages(runId) {
    return structuredClone(pages.get(runId) ?? []);
  },
};

let cached: ScrapeStorage | undefined;
let cachedMode: "cloudflare" | "local" = "local";

function hasCloudflareBindings(): boolean {
  try {
    return Boolean(env?.DB && env?.SCRAPE_BUCKET);
  } catch {
    return false;
  }
}

/** Prefer R2+D1; if the first D1 touch fails (no migrations yet), fall back to memory. */
export function getScrapeStorage(): ScrapeStorage {
  if (cached) return cached;

  if (!hasCloudflareBindings()) {
    cached = localScrapeStorage;
    cachedMode = "local";
    return cached;
  }

  const cf = createCloudflareScrapeStorage({
    DB: env.DB,
    SCRAPE_BUCKET: env.SCRAPE_BUCKET,
  });

  // Lazy-validate: wrap so a missing-table error doesn't kill the Worker mid-request forever.
  cached = {
    async saveRun(run) {
      try {
        await cf.saveRun(run);
        cachedMode = "cloudflare";
      } catch (err) {
        console.warn("[scrape-storage] D1/R2 saveRun failed — using local memory", err);
        cached = localScrapeStorage;
        cachedMode = "local";
        await localScrapeStorage.saveRun(run);
      }
    },
    async updateRun(id, patch) {
      try {
        return await cf.updateRun(id, patch);
      } catch (err) {
        console.warn("[scrape-storage] D1 updateRun failed — using local memory", err);
        cached = localScrapeStorage;
        cachedMode = "local";
        return localScrapeStorage.updateRun(id, patch);
      }
    },
    async getRun(id) {
      try {
        return await cf.getRun(id);
      } catch {
        return localScrapeStorage.getRun(id);
      }
    },
    async listRuns() {
      try {
        return await cf.listRuns();
      } catch {
        return localScrapeStorage.listRuns();
      }
    },
    async savePages(runId, items) {
      try {
        await cf.savePages(runId, items);
      } catch (err) {
        console.warn("[scrape-storage] D1/R2 savePages failed — using local memory", err);
        cached = localScrapeStorage;
        cachedMode = "local";
        await localScrapeStorage.savePages(runId, items);
      }
    },
    async getPages(runId) {
      try {
        return await cf.getPages(runId);
      } catch {
        return localScrapeStorage.getPages(runId);
      }
    },
  };
  cachedMode = "cloudflare";
  return cached;
}

export function scrapeStorageMode(): "cloudflare" | "local" {
  getScrapeStorage();
  return cachedMode;
}
