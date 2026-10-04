CREATE TABLE reading_session (
    id INTEGER PRIMARY KEY,
    book_id BLOB NOT NULL CHECK (length(book_id) = 16),
    started_at_ms INTEGER NOT NULL CHECK (started_at_ms >= 0),
    ended_at_ms INTEGER NOT NULL CHECK (ended_at_ms >= started_at_ms),
    utc_offset_minutes INTEGER NOT NULL CHECK (utc_offset_minutes BETWEEN -1080 AND 1080),
    page INTEGER NOT NULL CHECK (page >= 0),
    page_count INTEGER NOT NULL CHECK (page_count > page),
    local_day INTEGER GENERATED ALWAYS AS (
        (started_at_ms + utc_offset_minutes * 60000 + 86400000) / 86400000 - 1
    ) VIRTUAL
) STRICT;

CREATE INDEX reading_session_by_start ON reading_session (started_at_ms, id);

CREATE INDEX reading_session_by_day ON reading_session (local_day, started_at_ms, ended_at_ms);
