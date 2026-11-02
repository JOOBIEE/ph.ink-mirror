CREATE TABLE qr_styles (
  link_id INTEGER PRIMARY KEY REFERENCES links(id),
  style_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);