CREATE INDEX idx_clicks_time ON clicks(clicked_at);

CREATE TABLE daily_stats (
  link_id INTEGER NOT NULL REFERENCES links(id),
  day TEXT NOT NULL,
  is_bot INTEGER NOT NULL CHECK (is_bot IN (0, 1)),
  source TEXT NOT NULL CHECK (source IN ('link', 'qr')),
  country TEXT NOT NULL DEFAULT '',
  device TEXT NOT NULL DEFAULT '',
  browser TEXT NOT NULL DEFAULT '',
  referrer_host TEXT NOT NULL DEFAULT '',
  clicks INTEGER NOT NULL,
  PRIMARY KEY (link_id, day, is_bot, source, country, device, browser, referrer_host)
);

CREATE TABLE daily_visitors (
  link_id INTEGER NOT NULL REFERENCES links(id),
  day TEXT NOT NULL,
  is_bot INTEGER NOT NULL CHECK (is_bot IN (0, 1)),
  visitors INTEGER NOT NULL,
  PRIMARY KEY (link_id, day, is_bot)
);

CREATE TABLE rollup_days (
  day TEXT PRIMARY KEY,
  rolled_up_at INTEGER NOT NULL
);