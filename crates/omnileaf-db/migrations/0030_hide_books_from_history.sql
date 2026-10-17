CREATE TABLE history_hidden (
    book_id BLOB PRIMARY KEY CHECK (length(book_id) = 16),
    hidden_at_ms INTEGER NOT NULL CHECK (hidden_at_ms >= 0)
) STRICT, WITHOUT ROWID;

CREATE TABLE history_cleared (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    cleared_at_ms INTEGER NOT NULL CHECK (cleared_at_ms >= 0)
) STRICT;
