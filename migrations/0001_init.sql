-- 0001_init.sql — schema v1 (D1 / SQLite)
-- Quy tắc: mọi số trúng là TEXT (giữ số 0 ở đầu); draw_date là YYYY-MM-DD theo giờ VN;
-- timestamp là ISO-8601 UTC. Không bao giờ lưu số trúng dưới dạng INTEGER.

CREATE TABLE IF NOT EXISTS regions (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS stations (
  station_code TEXT PRIMARY KEY,
  region_code TEXT NOT NULL REFERENCES regions(code),
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  short_name TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  redistribution_allowed INTEGER NOT NULL DEFAULT 0,
  effective_from TEXT,
  effective_to TEXT,
  UNIQUE (region_code, slug)
);

CREATE TABLE IF NOT EXISTS station_aliases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  station_code TEXT NOT NULL REFERENCES stations(station_code),
  alias TEXT NOT NULL,
  from_date TEXT,
  to_date TEXT,
  UNIQUE (station_code, alias)
);

CREATE TABLE IF NOT EXISTS products (
  product_code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  prize_rule_version INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS prize_rules (
  version INTEGER NOT NULL,
  prize_code TEXT NOT NULL,
  label TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  count INTEGER NOT NULL,
  digits INTEGER NOT NULL,
  PRIMARY KEY (version, prize_code)
);

CREATE TABLE IF NOT EXISTS sources (
  source_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  is_authoritative INTEGER NOT NULL DEFAULT 0,
  rights_note TEXT,
  owner TEXT
);

CREATE TABLE IF NOT EXISTS schedule_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  station_code TEXT NOT NULL REFERENCES stations(station_code),
  product_code TEXT NOT NULL REFERENCES products(product_code),
  iso_weekday INTEGER NOT NULL CHECK (iso_weekday BETWEEN 1 AND 7),
  local_time TEXT NOT NULL,
  from_date TEXT NOT NULL,
  to_date TEXT,
  source_id TEXT REFERENCES sources(source_id),
  UNIQUE (station_code, product_code, iso_weekday, from_date)
);

CREATE TABLE IF NOT EXISTS schedule_exceptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  station_code TEXT NOT NULL,
  product_code TEXT NOT NULL,
  exception_date TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('skip', 'move')),
  new_date TEXT,
  new_time TEXT,
  source_id TEXT,
  UNIQUE (station_code, product_code, exception_date)
);

CREATE TABLE IF NOT EXISTS draws (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  draw_key TEXT NOT NULL UNIQUE,
  station_code TEXT NOT NULL REFERENCES stations(station_code),
  product_code TEXT NOT NULL REFERENCES products(product_code),
  draw_date TEXT NOT NULL,
  period_code TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'live', 'pending_confirmation', 'confirmed', 'disputed')),
  confirmed_revision_id INTEGER,
  rev INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  UNIQUE (station_code, product_code, draw_date)
);

CREATE TABLE IF NOT EXISTS result_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  draw_key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('live', 'final')),
  source_id TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  source_updated_at TEXT,
  content_hash TEXT NOT NULL,
  prizes_json TEXT NOT NULL,
  prize_rule_version INTEGER NOT NULL,
  is_correction INTEGER NOT NULL DEFAULT 0,
  confirmed_by TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (draw_key, kind, content_hash)
);

CREATE TABLE IF NOT EXISTS ingest_events (
  idem_key TEXT PRIMARY KEY,
  request_hash TEXT NOT NULL,
  result_code INTEGER NOT NULL,
  draw_key TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS index_policy (
  pattern TEXT PRIMARY KEY,
  from_date TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  note TEXT
);

CREATE TABLE IF NOT EXISTS redirects (
  old_path TEXT PRIMARY KEY,
  new_path TEXT NOT NULL,
  status INTEGER NOT NULL DEFAULT 301,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stats_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  station_code TEXT NOT NULL,
  metric TEXT NOT NULL,
  window_label TEXT NOT NULL,
  computed_at TEXT NOT NULL,
  values_json TEXT NOT NULL,
  coverage_periods INTEGER NOT NULL,
  coverage_total INTEGER NOT NULL,
  UNIQUE (station_code, metric, window_label)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_draws_station_date ON draws (station_code, draw_date DESC);
CREATE INDEX IF NOT EXISTS idx_draws_date ON draws (draw_date DESC);
CREATE INDEX IF NOT EXISTS idx_revisions_draw ON result_revisions (draw_key, id DESC);
CREATE INDEX IF NOT EXISTS idx_schedule_station ON schedule_rules (station_code, iso_weekday);
