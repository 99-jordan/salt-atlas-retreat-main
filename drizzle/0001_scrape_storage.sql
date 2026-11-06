-- Scrape runs (metadata + input) segmented from raw Apify datasets in R2.
CREATE TABLE IF NOT EXISTS scrape_runs (
  id TEXT PRIMARY KEY NOT NULL,
  apify_run_id TEXT NOT NULL,
  status TEXT NOT NULL,
  input_json TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  dataset_id TEXT,
  item_count INTEGER NOT NULL DEFAULT 0,
  r2_key TEXT,
  simulated INTEGER NOT NULL DEFAULT 0,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_scrape_runs_started_at ON scrape_runs (started_at DESC);

-- Individual crawled pages for a run (segmented rows for query / research).
CREATE TABLE IF NOT EXISTS scrape_pages (
  id TEXT PRIMARY KEY NOT NULL,
  run_id TEXT NOT NULL,
  url TEXT NOT NULL,
  canonical_url TEXT,
  title TEXT,
  depth INTEGER,
  loaded_at TEXT,
  http_status INTEGER,
  text TEXT,
  markdown TEXT,
  metadata_json TEXT,
  resort_id TEXT,
  FOREIGN KEY (run_id) REFERENCES scrape_runs (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_scrape_pages_run_id ON scrape_pages (run_id);
CREATE INDEX IF NOT EXISTS idx_scrape_pages_url ON scrape_pages (url);
