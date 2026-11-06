import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { ExclusivityStatus, FactStatus, ScrapeStatus, SourceType, Stage } from "@/lib/types";

type Tone = "ok" | "warn" | "bad" | "info" | "muted";
const toneCls: Record<Tone, string> = {
  ok: "bg-success/12 text-success ring-success/25",
  warn: "bg-warning/15 text-[color:var(--warning)] ring-warning/30",
  bad: "bg-destructive/10 text-destructive ring-destructive/25",
  info: "bg-primary/10 text-primary ring-primary/20",
  muted: "bg-muted text-muted-foreground ring-border",
};
export function Pill({ tone = "muted", children, dot = true, className }: { tone?: Tone; children: ReactNode; dot?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", toneCls[tone], className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export const FACT_TONE: Record<FactStatus, [Tone, string]> = {
  verified: ["ok", "Verified"], single: ["info", "Single source"], conflict: ["bad", "Conflict"],
  missing: ["warn", "Missing"], needs_confirmation: ["warn", "Needs resort confirmation"],
};
export const FactPill = ({ s }: { s: FactStatus }) => <Pill tone={FACT_TONE[s][0]}>{FACT_TONE[s][1]}</Pill>;

export const EXCL: Record<ExclusivityStatus, [Tone, string]> = { clear: ["ok", "Clear"], needs_review: ["warn", "Needs review"], blocked: ["bad", "Blocked"] };
export const ExclPill = ({ s }: { s: ExclusivityStatus }) => <Pill tone={EXCL[s][0]}>Exclusivity · {EXCL[s][1]}</Pill>;

export const SCRAPE: Record<ScrapeStatus, [Tone, string]> = {
  pending: ["muted", "Ready"], queued: ["muted", "Queued"], fetching: ["info", "Fetching"], extracting: ["info", "Extracting"],
  matching: ["info", "Matching resort"], completed: ["ok", "Completed"], failed: ["bad", "Failed"],
};

export const SOURCE_LABEL: Record<SourceType, string> = {
  official: "Official site", resort_owned: "Resort-owned", salt_atlas: "Salt Atlas knowledge", independent: "Independent", competitor: "Competitor",
};
export const SourceTag = ({ t }: { t: SourceType }) => (
  <span className={cn("rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider",
    t === "competitor" ? "bg-warning/15 text-[color:var(--warning)]" : t === "official" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>
    {SOURCE_LABEL[t]}
  </span>
);

export const STAGE_LABEL: Record<Stage, string> = { discover: "Discover", scrape: "Scrape", research: "Research & Verify", generate: "Generate & Edit", published: "Published" };

export function PageHeader({ eyebrow, title, description, crumbs = [], actions }: { eyebrow?: string; title: string; description?: ReactNode; crumbs?: { label: string; to?: string }[]; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <nav className="mb-3 flex items-center gap-1 text-xs text-muted-foreground" aria-label="Breadcrumb">
          <Link to="/" className="hover:text-foreground">Overview</Link>
          {crumbs.map((c) => (
            <span key={c.label} className="flex items-center gap-1">
              <ChevronRight className="size-3" />
              {c.to ? <Link to={c.to} className="hover:text-foreground">{c.label}</Link> : <span className="text-foreground">{c.label}</span>}
            </span>
          ))}
        </nav>
        {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
        <h1 className="text-3xl font-semibold tracking-tight md:text-[2.15rem]">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-[15px] text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("font-mono text-[12px]", className)}>{children}</span>;
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-xl border bg-card shadow-soft", className)}>{children}</div>;
}

export function ActivityLog({ lines, running }: { lines: string[]; running?: boolean }) {
  return (
    <div className="space-y-1.5 font-mono text-[12px]">
      {lines.map((l, i) => (
        <div key={i} className="flex gap-2 animate-in fade-in slide-in-from-bottom-1 duration-300">
          <span className="text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
          <span className={i === lines.length - 1 && running ? "text-primary" : "text-foreground/80"}>{l}</span>
        </div>
      ))}
      {running && <div className="ml-6 h-1 w-24 overflow-hidden rounded bg-primary/15"><div className="h-full w-full progress-shimmer bg-primary/40" /></div>}
    </div>
  );
}
