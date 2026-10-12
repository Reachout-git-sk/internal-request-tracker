-- Requests submitted by employees, plus an audit trail of every change.

CREATE TABLE requests (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT    NOT NULL,
  description   TEXT    NOT NULL,
  requester     TEXT    NOT NULL,
  category      TEXT    NOT NULL CHECK (category IN ('it_access', 'hardware', 'software', 'facilities', 'hr', 'finance', 'other')),
  priority      TEXT    NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  status        TEXT    NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  assignee      TEXT,
  summary       TEXT,
  -- what the model suggested, kept so we can measure how often people accept it
  ai_summary    TEXT,
  ai_category   TEXT,
  ai_model      TEXT,
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_requests_status   ON requests (status, created_at DESC);
CREATE INDEX idx_requests_category ON requests (category);

CREATE TABLE request_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id  INTEGER NOT NULL REFERENCES requests (id) ON DELETE CASCADE,
  kind        TEXT    NOT NULL,
  detail      TEXT,
  actor       TEXT    NOT NULL,
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_events_request ON request_events (request_id, id);
