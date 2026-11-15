-- Feedback sent through the form on the website. No account id and no network address are
-- stored. An email address is stored only when the person chose to type one.
CREATE TABLE feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  contact_email TEXT,
  page TEXT,
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'new'
);

CREATE INDEX idx_feedback_created ON feedback (created_at);