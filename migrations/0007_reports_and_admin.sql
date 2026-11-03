ALTER TABLE links ADD COLUMN block_reason TEXT;

CREATE TABLE reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  link_id INTEGER NOT NULL REFERENCES links(id),
  reason TEXT NOT NULL
    CHECK (reason IN ('phishing', 'malware', 'spam', 'illegal', 'other')),
  details TEXT,
  reporter_hash TEXT,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'actioned', 'dismissed')),
  created_at INTEGER NOT NULL,
  handled_at INTEGER,
  handled_by INTEGER REFERENCES users(id)
);

CREATE INDEX idx_reports_status_time ON reports(status, created_at);
CREATE INDEX idx_reports_link ON reports(link_id);

CREATE TABLE admin_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('link', 'user', 'report', 'system')),
  target_id INTEGER,
  detail TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_admin_audit_time ON admin_audit(created_at);
CREATE INDEX idx_admin_audit_target ON admin_audit(target_type, target_id);