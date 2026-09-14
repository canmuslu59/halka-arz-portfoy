CREATE TABLE IF NOT EXISTS installations (
  install_id TEXT PRIMARY KEY,
  fcm_token TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  threshold REAL NOT NULL DEFAULT 3,
  ipo_enabled INTEGER NOT NULL DEFAULT 1,
  holdings_json TEXT NOT NULL DEFAULT '[]',
  alert_state_json TEXT,
  ipo_state_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_installations_enabled ON installations(enabled);

CREATE TABLE IF NOT EXISTS runtime_state (
  state_key TEXT PRIMARY KEY,
  state_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
