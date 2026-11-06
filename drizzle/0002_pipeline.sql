-- Prompt + daily studio loop. Separate from the browser resort store.

CREATE TABLE IF NOT EXISTS pipeline_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  stage TEXT NOT NULL,
  instruction TEXT NOT NULL,
  day TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_pipeline_jobs_created ON pipeline_jobs (created_at DESC);

CREATE TABLE IF NOT EXISTS pipeline_targets (
  id TEXT PRIMARY KEY NOT NULL,
  job_id TEXT NOT NULL,
  resort_key TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  stage TEXT NOT NULL,
  scrape_run_id TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pipeline_targets_stage ON pipeline_targets (stage);
CREATE INDEX IF NOT EXISTS idx_pipeline_targets_job ON pipeline_targets (job_id);

CREATE TABLE IF NOT EXISTS pipeline_messages (
  id TEXT PRIMARY KEY NOT NULL,
  job_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pipeline_messages_job ON pipeline_messages (job_id, created_at);

CREATE TABLE IF NOT EXISTS pipeline_facts (
  id TEXT PRIMARY KEY NOT NULL,
  target_id TEXT NOT NULL,
  fact_key TEXT NOT NULL,
  value TEXT NOT NULL,
  source_url TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pipeline_facts_target ON pipeline_facts (target_id);

CREATE TABLE IF NOT EXISTS pipeline_drafts (
  id TEXT PRIMARY KEY NOT NULL,
  target_id TEXT NOT NULL,
  title TEXT NOT NULL,
  sections_json TEXT NOT NULL,
  r2_key TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pipeline_drafts_target ON pipeline_drafts (target_id);

CREATE TABLE IF NOT EXISTS pipeline_spend (
  day TEXT PRIMARY KEY NOT NULL,
  gbp REAL NOT NULL DEFAULT 0
);
