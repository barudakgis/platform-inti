-- Skema D1 untuk API ringan (SQLite)
CREATE TABLE IF NOT EXISTS items (
  id          TEXT PRIMARY KEY,
  app         TEXT NOT NULL,
  collection  TEXT NOT NULL,
  data        TEXT NOT NULL,                       -- JSON
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS items_app_col ON items (app, collection, created_at);

CREATE TABLE IF NOT EXISTS rate_limits (
  key       TEXT PRIMARY KEY,
  count     INTEGER NOT NULL,
  reset_at  INTEGER NOT NULL
);
