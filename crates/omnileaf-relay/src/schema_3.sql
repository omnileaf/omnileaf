CREATE TABLE status_audit (
  id              INTEGER PRIMARY KEY,
  code            TEXT NOT NULL REFERENCES reports (code) ON DELETE CASCADE,
  previous_status TEXT NOT NULL
                  CHECK (previous_status IN ('received', 'reviewing', 'published', 'duplicate', 'closed')),
  new_status      TEXT NOT NULL
                  CHECK (new_status IN ('received', 'reviewing', 'published', 'duplicate', 'closed')),
  issue           INTEGER CHECK ((new_status IN ('published', 'duplicate')) = (issue IS NOT NULL)),
  actor           TEXT NOT NULL,
  changed_at      INTEGER NOT NULL
) STRICT;

CREATE INDEX status_audit_by_code ON status_audit (code, changed_at, id);
