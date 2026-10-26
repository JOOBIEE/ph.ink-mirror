CREATE TABLE links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  destination TEXT NOT NULL,
  owner_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disabled', 'deleted', 'blocked')),
  expires_at INTEGER,
  password_hash TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_links_owner_id ON links(owner_id);