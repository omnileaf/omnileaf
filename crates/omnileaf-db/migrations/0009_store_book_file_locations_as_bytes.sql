CREATE TABLE book_file_new (
    id INTEGER PRIMARY KEY,
    book_id BLOB NOT NULL REFERENCES book (id) ON DELETE CASCADE,
    root_id INTEGER NOT NULL REFERENCES library_root (id) ON DELETE CASCADE,
    location BLOB NOT NULL,
    size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
    modified_at_ms INTEGER NOT NULL,
    rev INTEGER NOT NULL DEFAULT 1 CHECK (rev >= 1),
    UNIQUE (root_id, location)
) STRICT;

INSERT INTO book_file_new (id, book_id, root_id, location, size_bytes, modified_at_ms, rev)
    SELECT id, book_id, root_id, CAST(location AS BLOB), size_bytes, modified_at_ms, rev
    FROM book_file;

DROP TABLE book_file;

ALTER TABLE book_file_new RENAME TO book_file;

CREATE INDEX book_file_by_book ON book_file (book_id);
