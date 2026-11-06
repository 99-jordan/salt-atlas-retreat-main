import { getScrapeStorage } from "../scrape-storage";
import { createScrapeRunRecord } from "../scrape-server";
import { DEFAULT_WCC_INPUT, type WccPage } from "../wcc-types";
import { pipelineBucket } from "./db";
import {
  getTarget,
  insertDraft,
  insertFact,
  insertTarget,
  latestDraft,
  listFactsForTargets,
  listJobsByStatus,
  listOpenTargets,
  listTargets,
  patchJob,
  patchTarget,
  resortKey,
} from "./store";
import type { PipelineDraftSection, PipelineTarget } from "./types";

export interface ToolResult {
  text: string;
  halt?: "apify";
}

const TOOLS = [
  {
    name: "discover",
    description:
      "Save official surf-resort websites for a destination. Call this before scrape. Max 8 resorts. Use real official URLs only.",
    input_schema: {
      type: "object",
      properties: {
        destination: { type: "string" },
        resorts: {
          type: "array",
          maxItems: 8,
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              url: { type: "string" },
            },
            required: ["name", "url"],
          },
        },
      },
      required: ["destination", "resorts"],
    },
  },
  {
    name: "scrape",
    description:
      "Start one Apify Website Content Crawler run for pipeline targets that are not published. Returns immediately. Do not invent page content after this; wait until excerpts exist.",
    input_schema: {
      type: "object",
      properties: {
        targetIds: { type: "array", items: { type: "string" } },
      },
    },
  },
  {
    name: "research",
    description:
      "Save facts taken only from scraped page excerpts. sourceUrl must be one of the crawled page URLs for that target. Do not invent values.",
    input_schema: {
      type: "object",
      properties: {
        facts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              targetId: { type: "string" },
              key: { type: "string" },
              value: { type: "string" },
              sourceUrl: { type: "string" },
            },
            required: ["targetId", "key", "value", "sourceUrl"],
          },
        },
      },
      required: ["facts"],
    },
  },
  {
    name: "generate",
    description:
      "Write a draft page from verified facts only. Each section body must stay inside those facts. Missing facts stay as gaps, never guesses.",
    input_schema: {
      type: "object",
      properties: {
        drafts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              targetId: { type: "string" },
              title: { type: "string" },
              sections: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    body: { type: "string" },
                  },
                  required: ["title", "body"],
                },
              },
            },
            required: ["targetId", "title", "sections"],
          },
        },
      },
      required: ["drafts"],
    },
  },
  {
    name: "publish",
    description:
      "Store the draft in R2 and mark the target published. This does not deploy the public Salt Atlas website.",
    input_schema: {
      type: "object",
      properties: {
        targetIds: { type: "array", items: { type: "string" } },
      },
      required: ["targetIds"],
    },
  },
] as const;

export function pipelineToolSchemas(): Array<{
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}> {
  return TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema as unknown as Record<string, unknown>,
  }));
}

function asRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" ? (input as Record<string, unknown>) : {};
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function pagesForTarget(target: PipelineTarget, pages: WccPage[]): WccPage[] {
  const host = hostname(target.url);
  return pages.filter((p) => {
    const h = hostname(p.url);
    return h === host || p.url.startsWith(target.url.replace(/\/$/, ""));
  });
}

export async function excerptsForTarget(target: PipelineTarget): Promise<string> {
  if (!target.scrapeRunId) return "";
  const pages = await getScrapeStorage().getPages(target.scrapeRunId);
  const matched = pagesForTarget(target, pages).slice(0, 3);
  return matched
    .map((p) => {
      const body = (p.markdown || p.text || "").replace(/\s+/g, " ").slice(0, 500);
      return `- ${p.url}\n  ${body}`;
    })
    .join("\n");
}

async function anyScrapeWaiting(): Promise<boolean> {
  const waiting = await listJobsByStatus("waiting_apify");
  return waiting.length > 0;
}

export async function executeTool(jobId: string, name: string, input: unknown): Promise<ToolResult> {
  try {
    if (name === "discover") return await discover(jobId, input);
    if (name === "scrape") return await scrape(jobId, input);
    if (name === "research") return await research(input);
    if (name === "generate") return await generate(input);
    if (name === "publish") return await publish(jobId, input);
    return { text: `Unknown tool ${name}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Tool failed";
    return { text: message };
  }
}

async function discover(jobId: string, input: unknown): Promise<ToolResult> {
  const data = asRecord(input);
  const destination = String(data["destination"] ?? "").trim();
  const resorts = Array.isArray(data["resorts"]) ? data["resorts"] : [];
  if (!destination) return { text: "destination is required" };
  const existing = await listTargets();
  const seen = new Set(existing.map((t) => t.url.replace(/\/$/, "")));
  const saved: string[] = [];
  for (const raw of resorts.slice(0, 8)) {
    const row = asRecord(raw);
    const name = String(row["name"] ?? "").trim();
    let url = String(row["url"] ?? "").trim();
    if (!name || !url) continue;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    try {
      url = new URL(url).href;
    } catch {
      continue;
    }
    const key = url.replace(/\/$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    const target = await insertTarget({ jobId, resortKey: resortKey(name), name, url });
    saved.push(`${target.name} (${target.id}) ${target.url}`);
  }
  await patchJob(jobId, { stage: "discover", status: "running" });
  if (!saved.length) return { text: `No new resorts saved for ${destination}.` };
  return { text: `Saved ${saved.length} resort(s) for ${destination}:\n${saved.join("\n")}` };
}

async function scrape(jobId: string, input: unknown): Promise<ToolResult> {
  if (await anyScrapeWaiting()) {
    return { text: "A scrape is already waiting on Apify. Do not start another.", halt: "apify" };
  }
  const data = asRecord(input);
  const requested = Array.isArray(data["targetIds"])
    ? new Set(data["targetIds"].map((id) => String(id)))
    : null;
  const open = await listOpenTargets();
  const targets = open.filter((t) => {
    if (requested && !requested.has(t.id)) return false;
    return t.stage === "discover" || t.stage === "scrape";
  });
  if (!targets.length) return { text: "No discover/scrape targets to crawl." };

  const startUrls = targets.map((t) => ({ url: t.url }));
  const cap = Math.min(40, Math.max(4, startUrls.length * 6));
  const record = await createScrapeRunRecord({
    ...DEFAULT_WCC_INPUT,
    startUrls,
    maxCrawlDepth: 1,
    maxCrawlPages: cap,
    maxResults: cap,
    saveMarkdown: true,
  });

  for (const target of targets) {
    await patchTarget(target.id, { stage: "scrape", scrapeRunId: record.id });
  }
  await patchJob(jobId, { stage: "scrape", status: record.status === "SUCCEEDED" ? "running" : "waiting_apify" });

  if (record.status === "SUCCEEDED") {
    const lines = [`Scrape ${record.id} finished (${record.itemCount} pages, simulated=${record.simulated}).`];
    for (const target of targets) {
      const excerpt = await excerptsForTarget({ ...target, stage: "scrape", scrapeRunId: record.id });
      if (excerpt) lines.push(`\n${target.name} [${target.id}]\n${excerpt}`);
    }
    lines.push("Call research next, using only these excerpts.");
    return { text: lines.join("\n") };
  }

  return {
    text: `Scrape ${record.id} started on Apify (${record.apifyRunId}) for ${targets.length} URL(s). Stop until it finishes.`,
    halt: "apify",
  };
}

async function research(input: unknown): Promise<ToolResult> {
  const data = asRecord(input);
  const facts = Array.isArray(data["facts"]) ? data["facts"] : [];
  const saved: string[] = [];
  const rejected: string[] = [];
  const touched = new Set<string>();

  for (const raw of facts.slice(0, 40)) {
    const row = asRecord(raw);
    const targetId = String(row["targetId"] ?? "");
    const key = String(row["key"] ?? "").trim().slice(0, 80);
    const value = String(row["value"] ?? "").trim().slice(0, 500);
    const sourceUrl = String(row["sourceUrl"] ?? "").trim();
    if (!targetId || !key || !value || !sourceUrl) {
      rejected.push("incomplete fact");
      continue;
    }
    const target = await getTarget(targetId);
    if (!target?.scrapeRunId) {
      rejected.push(`${key}: target has no scrape`);
      continue;
    }
    const pages = await getScrapeStorage().getPages(target.scrapeRunId);
    const allowed = new Set(pagesForTarget(target, pages).map((p) => p.url));
    if (!allowed.has(sourceUrl)) {
      rejected.push(`${key}: sourceUrl is not a crawled page`);
      continue;
    }
    await insertFact({ targetId, key, value, sourceUrl });
    touched.add(targetId);
    saved.push(`${key}=${value}`);
  }

  for (const targetId of touched) {
    await patchTarget(targetId, { stage: "generate" });
  }

  return {
    text: `Saved ${saved.length} fact(s).${saved.length ? `\n${saved.slice(0, 12).join("\n")}` : ""}${
      rejected.length ? `\nRejected: ${rejected.slice(0, 6).join("; ")}` : ""
    }`,
  };
}

async function generate(input: unknown): Promise<ToolResult> {
  const data = asRecord(input);
  const drafts = Array.isArray(data["drafts"]) ? data["drafts"] : [];
  const lines: string[] = [];
  for (const raw of drafts.slice(0, 8)) {
    const row = asRecord(raw);
    const targetId = String(row["targetId"] ?? "");
    const title = String(row["title"] ?? "").trim().slice(0, 180);
    const sectionsRaw = Array.isArray(row["sections"]) ? row["sections"] : [];
    const target = await getTarget(targetId);
    if (!target) {
      lines.push(`${targetId}: missing target`);
      continue;
    }
    const facts = await listFactsForTargets([targetId]);
    if (!facts.length) {
      lines.push(`${target.name}: no verified facts yet`);
      continue;
    }
    const sections: PipelineDraftSection[] = sectionsRaw.slice(0, 12).flatMap((section) => {
      const s = asRecord(section);
      const sectionTitle = String(s["title"] ?? "").trim();
      const body = String(s["body"] ?? "").trim();
      if (!sectionTitle || !body) return [];
      return [{ title: sectionTitle.slice(0, 140), body: body.slice(0, 1200) }];
    });
    if (!title || !sections.length) {
      lines.push(`${target.name}: draft needs a title and sections`);
      continue;
    }
    const r2Key = `drafts/${targetId}.json`;
    await pipelineBucket().put(r2Key, JSON.stringify({ title, sections, facts }), {
      httpMetadata: { contentType: "application/json" },
    });
    await insertDraft({ targetId, title, sections, r2Key });
    await patchTarget(targetId, { stage: "generate" });
    lines.push(`${target.name}: draft stored at ${r2Key}`);
  }
  return { text: lines.join("\n") || "No drafts saved." };
}

async function publish(jobId: string, input: unknown): Promise<ToolResult> {
  const data = asRecord(input);
  const ids = Array.isArray(data["targetIds"]) ? data["targetIds"].map((id) => String(id)) : [];
  const lines: string[] = [];
  for (const targetId of ids.slice(0, 8)) {
    const target = await getTarget(targetId);
    if (!target) {
      lines.push(`${targetId}: missing`);
      continue;
    }
    const draft = await latestDraft(targetId);
    if (!draft) {
      lines.push(`${target.name}: no draft to publish`);
      continue;
    }
    const r2Key = draft.r2Key ?? `drafts/${targetId}.json`;
    await pipelineBucket().put(
      r2Key,
      JSON.stringify({ title: draft.title, sections: draft.sections, publishedAt: new Date().toISOString() }),
      { httpMetadata: { contentType: "application/json" } },
    );
    await patchTarget(targetId, { stage: "published" });
    lines.push(`${target.name}: marked published (${r2Key}). Public site was not deployed.`);
  }
  const open = await listOpenTargets();
  if (!open.length) await patchJob(jobId, { status: "done", stage: "published" });
  else await patchJob(jobId, { stage: "generate", status: "running" });
  return { text: lines.join("\n") || "Nothing published." };
}
