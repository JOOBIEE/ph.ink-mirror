-- LOCAL TESTING ONLY. NEVER run this with --remote.
-- Plants fake clicks and salts so we can watch the rollup job work.

INSERT INTO clicks
  (link_id, clicked_at, country, device, browser, referrer_host, source, is_bot, visitor_hash)
VALUES
  ((SELECT id FROM links ORDER BY id LIMIT 1), CAST(strftime('%s','now','-2 days') AS INTEGER), 'NG', 'mobile',  'Chrome',  'google.com', 'link', 0, 'visitor-a'),
  ((SELECT id FROM links ORDER BY id LIMIT 1), CAST(strftime('%s','now','-2 days') AS INTEGER), 'NG', 'mobile',  'Chrome',  'google.com', 'link', 0, 'visitor-a'),
  ((SELECT id FROM links ORDER BY id LIMIT 1), CAST(strftime('%s','now','-2 days') AS INTEGER), 'GB', 'desktop', 'Firefox', NULL,         'qr',   0, 'visitor-b'),
  ((SELECT id FROM links ORDER BY id LIMIT 1), CAST(strftime('%s','now','-2 days') AS INTEGER), 'NG', 'mobile',  'Chrome',  'google.com', 'link', 1, 'bot-1'),
  ((SELECT id FROM links ORDER BY id LIMIT 1), CAST(strftime('%s','now','-100 days') AS INTEGER), 'NG', 'mobile', 'Chrome',  'google.com', 'link', 0, 'visitor-old');

INSERT OR IGNORE INTO daily_salts (day, salt)
VALUES ('2020-01-01', 'old-test-salt'), (date('now'), 'test-salt-today');