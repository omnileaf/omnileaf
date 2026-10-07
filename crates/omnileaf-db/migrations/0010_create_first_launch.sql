CREATE TABLE first_launch (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    finished_at_ms INTEGER NOT NULL
) STRICT;

INSERT INTO first_launch (id, finished_at_ms)
    SELECT 1, unixepoch() * 1000
    WHERE EXISTS (SELECT 1 FROM library_root WHERE kind <> 'home')
        OR EXISTS (SELECT 1 FROM book);
