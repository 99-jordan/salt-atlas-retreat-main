import { createFileRoute } from "@tanstack/react-router";
import { Play, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Mono, PageHeader, Panel, Pill } from "@/components/studio/ui-bits";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getPipelineBoard, sendPipelineMessage, tickPipeline } from "@/lib/pipeline/server";
import type { PipelineBoard, PipelineJobStatus } from "@/lib/pipeline/types";

export const Route = createFileRoute("/pipeline")({
  head: () => ({
    meta: [
      { title: "Pipeline — Salt Atlas Resort Studio" },
      {
        name: "description",
        content: "Tell Claude to run discover, scrape, research, generate, and publish. A daily job continues unfinished targets.",
      },
    ],
  }),
  component: PipelinePage,
});

function statusTone(status: PipelineJobStatus): "ok" | "warn" | "bad" | "info" | "muted" {
  if (status === "done") return "ok";
  if (status === "failed") return "bad";
  if (status === "paused_budget") return "warn";
  if (status === "waiting_apify" || status === "running") return "info";
  return "muted";
}

function PipelinePage() {
  const [board, setBoard] = useState<PipelineBoard | null>(null);
  const [text, setText] = useState(
    "Discover surf lodges in Ericeira and take them through scrape, research, and a draft.",
  );
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | undefined>();

  const load = async (jobId?: string) => {
    const next = await getPipelineBoard({ data: jobId ? { jobId } : {} });
    setBoard(next);
    setSelectedId(next.job?.id);
  };

  useEffect(() => {
    void load().catch(() => toast.error("Could not load the pipeline. Is local D1 migrated?"));
  }, []);

  const send = async () => {
    const message = text.trim();
    if (!message) return;
    setBusy(true);
    try {
      const next = await sendPipelineMessage({
        data: { text: message, ...(selectedId ? { jobId: selectedId } : {}) },
      });
      setBoard(next);
      setSelectedId(next.job?.id);
      setText("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Send failed");
    } finally {
      setBusy(false);
    }
  };

  const tick = async () => {
    setBusy(true);
    try {
      const next = await tickPipeline();
      setBoard(next);
      setSelectedId(next.job?.id);
      if (next.note) toast.message(next.note);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Tick failed");
    } finally {
      setBusy(false);
    }
  };

  const spend = board ? `£${board.spendGbp.toFixed(3)} / £${board.capGbp.toFixed(2)}` : "…";

  return (
    <div className="mx-auto max-w-[1400px] px-5 py-8 md:px-10 md:py-10">
      <PageHeader
        eyebrow="Claude"
        title="Pipeline"
        crumbs={[{ label: "Pipeline" }]}
        description="One prompt runs the studio loop. A Cloudflare cron at 06:00 UTC continues unfinished targets, and a 15-minute cron picks up finished Apify scrapes. Publish stores a draft — it does not deploy the public site."
        actions={
          <Button variant="outline" onClick={() => void tick()} disabled={busy}>
            <RefreshCw className="size-4" />
            Run daily tick
          </Button>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2 text-[13px]">
        <Pill tone={board && board.spendGbp < board.capGbp ? "ok" : "warn"}>{spend} today</Pill>
        {board?.model && <Mono className="text-muted-foreground">{board.model}</Mono>}
        {board?.job && <Pill tone={statusTone(board.job.status)}>{board.job.status}</Pill>}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Panel className="flex min-h-[520px] flex-col">
          <div className="flex-1 space-y-3 overflow-auto p-5">
            {!board?.messages.length && (
              <p className="text-sm text-muted-foreground">
                Ask Claude to discover resorts and carry them through scrape, research, a draft, and publish.
              </p>
            )}
            {board?.messages.map((m) => (
              <div key={m.id} className={m.role === "user" ? "ml-8" : "mr-8"}>
                <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {m.role}
                </div>
                <div className="whitespace-pre-wrap rounded-lg border bg-background px-3 py-2 text-sm">{m.content}</div>
              </div>
            ))}
          </div>
          <div className="border-t p-4">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              disabled={busy}
              placeholder="Discover surf lodges in Ericeira and take them through scrape, research, and a draft."
            />
            <div className="mt-3 flex justify-end">
              <Button onClick={() => void send()} disabled={busy || !text.trim()}>
                <Play className="size-4" />
                {busy ? "Working…" : "Send"}
              </Button>
            </div>
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel className="p-4">
            <div className="mb-3 font-medium">Jobs</div>
            <div className="space-y-2">
              {board?.jobs.map((job) => (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => void load(job.id)}
                  className="flex w-full items-start justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm hover:bg-accent"
                >
                  <span>
                    <span className="font-medium">{job.kind}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{job.stage}</span>
                  </span>
                  <Pill tone={statusTone(job.status)}>{job.status}</Pill>
                </button>
              ))}
              {!board?.jobs.length && <p className="text-sm text-muted-foreground">No jobs yet.</p>}
            </div>
          </Panel>

          <Panel className="p-4">
            <div className="mb-3 font-medium">Targets</div>
            <div className="space-y-2">
              {board?.targets.map((t) => (
                <div key={t.id} className="rounded-lg border px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{t.name}</span>
                    <Pill tone={t.stage === "published" ? "ok" : "info"}>{t.stage}</Pill>
                  </div>
                  <a href={t.url} className="mt-1 block truncate text-xs text-muted-foreground" target="_blank" rel="noreferrer">
                    {t.url}
                  </a>
                </div>
              ))}
              {!board?.targets.length && <p className="text-sm text-muted-foreground">No resorts queued.</p>}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
