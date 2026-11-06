import {
  toActorInput,
  type ApifyRunStatus,
  type WccInput,
  type WccPage,
} from "./wcc-types";

const APIFY_BASE = "https://api.apify.com/v2";

function token(): string | undefined {
  return process.env["APIFY_TOKEN"]?.trim() || undefined;
}

function actorId(): string {
  return process.env["APIFY_ACTOR_ID"]?.trim() || "apify/website-content-crawler";
}

function actorPath(): string {
  // API expects username~name or raw id
  return actorId().replace("/", "~");
}

function buildQuery(): string {
  const build = process.env["APIFY_ACTOR_BUILD"]?.trim();
  return build ? `?build=${encodeURIComponent(build)}` : "";
}

export function apifyConfigured(): boolean {
  return Boolean(token());
}

interface ApifyRunPayload {
  id: string;
  status: ApifyRunStatus;
  defaultDatasetId?: string;
  startedAt?: string;
  finishedAt?: string;
  statusMessage?: string;
}

async function apifyFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const t = token();
  if (!t) throw new Error("APIFY_TOKEN is not set");
  const res = await fetch(`${APIFY_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${t}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Apify ${res.status}: ${body.slice(0, 400) || res.statusText}`);
  }
  const json = (await res.json()) as { data: T };
  return json.data;
}

export async function startWebsiteContentCrawl(input: WccInput): Promise<{
  apifyRunId: string;
  status: ApifyRunStatus;
  datasetId?: string;
  simulated: boolean;
}> {
  if (!token()) {
    const mockId = `mock_${Date.now().toString(36)}`;
    return { apifyRunId: mockId, status: "RUNNING", datasetId: `ds_${mockId}`, simulated: true };
  }

  const run = await apifyFetch<ApifyRunPayload>(
    `/acts/${actorPath()}/runs${buildQuery()}`,
    {
      method: "POST",
      body: JSON.stringify(toActorInput(input)),
    },
  );

  return {
    apifyRunId: run.id,
    status: run.status,
    ...(run.defaultDatasetId ? { datasetId: run.defaultDatasetId } : {}),
    simulated: false,
  };
}

export async function getApifyRun(apifyRunId: string): Promise<{
  status: ApifyRunStatus;
  datasetId?: string;
  finishedAt?: string;
  statusMessage?: string;
  simulated: boolean;
}> {
  if (apifyRunId.startsWith("mock_")) {
    return {
      status: "SUCCEEDED",
      datasetId: `ds_${apifyRunId}`,
      finishedAt: new Date().toISOString(),
      simulated: true,
    };
  }

  const run = await apifyFetch<ApifyRunPayload>(`/actor-runs/${apifyRunId}`);
  return {
    status: run.status,
    ...(run.defaultDatasetId ? { datasetId: run.defaultDatasetId } : {}),
    ...(run.finishedAt ? { finishedAt: run.finishedAt } : {}),
    ...(run.statusMessage ? { statusMessage: run.statusMessage } : {}),
    simulated: false,
  };
}

export async function listDatasetItems(
  datasetId: string,
  opts: { limit?: number; offset?: number } = {},
): Promise<WccPage[]> {
  if (datasetId.startsWith("ds_mock_")) {
    return [];
  }

  const limit = opts.limit ?? 1000;
  const offset = opts.offset ?? 0;
  const t = token();
  if (!t) throw new Error("APIFY_TOKEN is not set");

  const res = await fetch(
    `${APIFY_BASE}/datasets/${datasetId}/items?format=json&clean=true&limit=${limit}&offset=${offset}`,
    { headers: { Authorization: `Bearer ${t}` } },
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Apify dataset ${res.status}: ${body.slice(0, 400) || res.statusText}`);
  }
  return (await res.json()) as WccPage[];
}

/** Fabricate WCC-shaped pages for mock runs (no token). */
export function mockPagesForInput(input: WccInput): WccPage[] {
  const now = new Date().toISOString();
  return input.startUrls.flatMap((s, i) => {
    let host = "example.com";
    try {
      host = new URL(s.url).hostname;
    } catch {
      /* keep default */
    }
    const base: WccPage = {
      url: s.url,
      text: `Simulated crawl of ${s.url}. Official resort content would appear here after a real Apify run.`,
      markdown: `# ${host}\n\nSimulated crawl of ${s.url}.\n\n- Rooms & rates\n- Surf conditions\n- Contact`,
      metadata: {
        title: `${host} — simulated`,
        description: "Mock Website Content Crawler result (APIFY_TOKEN not set).",
        canonicalUrl: s.url,
        languageCode: "en",
      },
      crawl: {
        loadedUrl: s.url,
        loadedTime: now,
        depth: 0,
        httpStatusCode: 200,
      },
    };
    if (input.maxCrawlDepth <= 0 || input.maxCrawlPages <= 1) return [base];
    const child: WccPage = {
      url: `${s.url.replace(/\/$/, "")}/packages`,
      text: `Packages page for ${host} (simulated).`,
      markdown: `## Packages\n\n7-night packages and transfers for ${host}.`,
      metadata: {
        title: `Packages — ${host}`,
        canonicalUrl: `${s.url.replace(/\/$/, "")}/packages`,
        languageCode: "en",
      },
      crawl: {
        loadedUrl: `${s.url.replace(/\/$/, "")}/packages`,
        loadedTime: now,
        referrerUrl: s.url,
        depth: 1,
        httpStatusCode: 200,
      },
    };
    return i % 2 === 0 ? [base, child] : [base];
  });
}
