CREATE TABLE reports (
  code              TEXT PRIMARY KEY,
  status_key_hash   BLOB NOT NULL CHECK (length(status_key_hash) = 32),
  body_hash         BLOB NOT NULL CHECK (length(body_hash) = 32),
  platform          TEXT NOT NULL,
  version           TEXT NOT NULL,
  report            TEXT,
  status            TEXT NOT NULL DEFAULT 'received'
                    CHECK (status IN ('received', 'reviewing', 'published', 'closed')),
  issue             INTEGER CHECK ((status = 'published') = (issue IS NOT NULL)),
  received_at       INTEGER NOT NULL,
  status_changed_at INTEGER NOT NULL
) STRICT;

CREATE INDEX reports_by_status ON reports (status, received_at);

CREATE TABLE reply_addresses (
  code    TEXT PRIMARY KEY REFERENCES reports (code) ON DELETE CASCADE,
  address TEXT NOT NULL CHECK (length(address) <= 254)
) STRICT;

CREATE TABLE challenges (
  id         BLOB PRIMARY KEY CHECK (length(id) = 16),
  difficulty INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
) STRICT;

CREATE TABLE ip_salts (
  day  INTEGER PRIMARY KEY,
  salt BLOB NOT NULL CHECK (length(salt) = 32)
) STRICT;

CREATE TABLE ip_counts (
  ip_hash BLOB NOT NULL,
  action  TEXT NOT NULL CHECK (action IN ('challenge', 'report', 'status')),
  hour    INTEGER NOT NULL,
  count   INTEGER NOT NULL,
  PRIMARY KEY (ip_hash, action, hour)
) STRICT, WITHOUT ROWID;
