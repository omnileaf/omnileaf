CREATE TABLE book_pages (
    file_id INTEGER PRIMARY KEY REFERENCES book_file (id) ON DELETE CASCADE,
    rev INTEGER NOT NULL CHECK (rev >= 1),
    manifest BLOB NOT NULL CHECK (length(manifest) % 8 = 0)
) STRICT;
