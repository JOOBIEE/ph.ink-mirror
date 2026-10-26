CREATE TABLE clicks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  link_id INTEGER NOT NULL REFERENCES links(id),
  clicked_at INTEGER NOT NULL,
  country TEXT,
  device TEXT,
  browser TEXT,
  referrer_host TEXT,
  source TEXT NOT NULL DEFAULT 'link'
    CHECK (source IN ('link', 'qr')),
  is_bot INTEGER NOT NULL DEFAULT 0
    CHECK (is_bot IN (0, 1)),
  visitor_hash TEXT
);

CREATE INDEX idx_clicks_link_time ON clicks(link_id, clicked_at);

CREATE TABLE daily_salts (
  day TEXT PRIMARY KEY,
  salt TEXT NOT NULL
);