import { syncScrapeRun } from "../scrape-server";
import { utcDay } from "./db";
import { runAgent } from "./runner";
import {
  addMessage,
  createJob,
  listJobsByStatus,
  listOpenTargets,
  listTargets,
  openDailyJob,
  patchJob,
  patchTarget,
} from "./store";

const TERMINAL = new Set(["SUCCEEDED", "FAILED", "TIMED-OUT", "ABORTED"]);
const FAILED = new Set(["FAILED", "TIMED-OUT", "ABORTED"]);

export async function advanceWaitingJobs(): Promise<string> {
  const waiting = await listJobsByStatus("waiting_apify");
  if (!waiting.length) return "No Apify jobs in flight.";

  const notes: string[] = [];
  for (const job of waiting) {
    const targets = (await listTargets()).filter((t) => t.stage === "scrape" && t.scrapeRunId);
    if (!targets.length) {
      await patchJob(job.id, { status: "failed", errorMessage: "Waiting on Apify but no scrape targets" });
      notes.push(`${job.id} failed: no scrape targets`);
      continue;
    }

    let pending = false;
    let failed = false;
    const seen = new Set<string>();
    for (const target of targets) {
      const runId = target.scrapeRunId;
      if (!runId || seen.has(runId)) continue;
      seen.add(runId);
      const run = await syncScrapeRun(runId);
      if (!TERMINAL.has(run.status)) pending = true;
      if (FAILED.has(run.status)) failed = true;
    }

    if (pending) {
      notes.push(`${job.id} still crawling`);
      continue;
    }
    if (failed) {
      await patchJob(job.id, { status: "failed", errorMessage: "Apify scrape failed" });
      await addMessage(job.id, "assistant", "Apify scrape failed. Nothing was published.");
      notes.push(`${job.id} scrape failed`);
      continue;
    }

    for (const target of targets) {
      await patchTarget(target.id, { stage: "research" });
    }
    await runAgent(
      job.id,
      "Apify scrape finished. Call research using only the excerpts, then generate, then publish. Do not invent facts.",
    );
    notes.push(`Continued ${job.id}`);
  }
  return notes.join(" ");
}

export async function startDailyJob(): Promise<string> {
  const openTargets = await listOpenTargets();
  const existing = await openDailyJob();
  if (existing) {
    if (existing.status === "waiting_apify" || existing.status === "running") {
      return "Daily job already in flight.";
    }
    if (existing.status === "paused_budget" && existing.day === utcDay()) {
      return "Daily job paused: £ cap reached.";
    }
    if (!openTargets.length) {
      await patchJob(existing.id, { status: "done", stage: "published" });
      return "Nothing due.";
    }
    await runAgent(existing.id, "Daily run. Continue unpublished targets. Do not invent facts.");
    return `Resumed daily job ${existing.id}.`;
  }
  if (!openTargets.length) return "Nothing due.";
  const stage = openTargets[0]?.stage ?? "discover";
  const job = await createJob({
    kind: "daily",
    instruction:
      "Daily run. Continue unpublished targets through scrape, research, generate, and publish. Do not invent facts.",
    stage,
  });
  await runAgent(job.id, job.instruction);
  return `Started daily job ${job.id}.`;
}

export async function runPipelineTick(): Promise<string> {
  const advanced = await advanceWaitingJobs();
  const daily = await startDailyJob();
  return `${advanced} ${daily}`;
}

export async function runScheduled(cron: string): Promise<void> {
  if (cron === "0 6 * * *") await startDailyJob();
  await advanceWaitingJobs();
}
