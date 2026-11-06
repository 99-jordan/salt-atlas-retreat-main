import { createServerFn } from "@tanstack/react-start";
import { dailyCapGbp } from "./budget";
import { utcDay } from "./db";
import { runPipelineTick } from "./cron";
import { boardFor, runAgent } from "./runner";
import { addMessage, createJob, getJob, latestOpenChatJob } from "./store";
import type { PipelineBoard } from "./types";

export const getPipelineBoard = createServerFn({ method: "GET" })
  .validator((data: { jobId?: string } | undefined) => data ?? {})
  .handler(async ({ data }): Promise<PipelineBoard> => boardFor(data.jobId));

export const sendPipelineMessage = createServerFn({ method: "POST" })
  .validator((data: { text: string; jobId?: string }) => {
    const text = data?.text?.trim() ?? "";
    if (!text) throw new Error("Message is empty");
    if (text.length > 4000) throw new Error("Message is too long");
    return { text, ...(data.jobId ? { jobId: data.jobId } : {}) };
  })
  .handler(async ({ data }): Promise<PipelineBoard> => {
    let job = data.jobId ? await getJob(data.jobId) : await latestOpenChatJob();
    if (!job || job.kind !== "chat" || job.status === "done" || job.status === "failed") {
      job = await createJob({ kind: "chat", instruction: data.text });
    }
    await addMessage(job.id, "user", data.text);

    if (job.status === "waiting_apify") {
      await addMessage(job.id, "assistant", "A scrape is still running on Apify. I'll continue when it finishes.");
      return boardFor(job.id);
    }
    if (job.status === "paused_budget" && job.day === utcDay()) {
      await addMessage(
        job.id,
        "assistant",
        `Paused until tomorrow. Today's Claude cap is £${dailyCapGbp().toFixed(2)}.`,
      );
      return boardFor(job.id);
    }

    await runAgent(job.id);
    return boardFor(job.id);
  });

export const tickPipeline = createServerFn({ method: "POST" }).handler(async (): Promise<PipelineBoard> => {
  const note = await runPipelineTick();
  return boardFor(undefined, note);
});
