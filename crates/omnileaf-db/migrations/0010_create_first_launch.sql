CREATE TABLE first_launch (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    finished_at_ms INTEGER NOT NULL
) STRICT;
