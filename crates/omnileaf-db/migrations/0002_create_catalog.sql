CREATE TABLE library_root (
    id INTEGER PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('home', 'linked')),
    locator_kind TEXT NOT NULL CHECK (locator_kind IN ('path', 'android_tree', 'apple_bookmark')),
    location BLOB NOT NULL UNIQUE,
    bookmark BLOB CHECK ((bookmark IS NOT NULL) = (locator_kind = 'apple_bookmark')),
    added_at_ms INTEGER NOT NULL
) STRICT;

CREATE TABLE series (
    local_id INTEGER PRIMARY KEY,
    id BLOB NOT NULL UNIQUE CHECK (length(id) = 16),
    source_id TEXT NOT NULL,
    natural_key TEXT NOT NULL,
    title TEXT NOT NULL,
    title_sort_key BLOB NOT NULL,
    book_count INTEGER NOT NULL DEFAULT 0 CHECK (book_count >= 0),
    added_at_ms INTEGER NOT NULL,
    UNIQUE (source_id, natural_key)
) STRICT;

CREATE INDEX series_by_title ON series (title_sort_key, local_id) WHERE book_count > 0;
CREATE INDEX series_by_added ON series (added_at_ms, local_id) WHERE book_count > 0;

CREATE TABLE book (
    id BLOB PRIMARY KEY CHECK (length(id) = 16),
    series_local_id INTEGER NOT NULL REFERENCES series (local_id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    title_sort_key BLOB NOT NULL,
    added_at_ms INTEGER NOT NULL
) STRICT, WITHOUT ROWID;

CREATE INDEX book_by_series ON book (series_local_id, title_sort_key, id);

CREATE TABLE book_file (
    id INTEGER PRIMARY KEY,
    book_id BLOB NOT NULL REFERENCES book (id) ON DELETE CASCADE,
    root_id INTEGER NOT NULL REFERENCES library_root (id) ON DELETE CASCADE,
    location TEXT NOT NULL,
    size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
    modified_at_ms INTEGER NOT NULL,
    rev INTEGER NOT NULL DEFAULT 1 CHECK (rev >= 1),
    UNIQUE (root_id, location)
) STRICT;

CREATE INDEX book_file_by_book ON book_file (book_id);

CREATE TRIGGER book_counted_after_insert AFTER INSERT ON book BEGIN
    UPDATE series SET book_count = book_count + 1 WHERE local_id = new.series_local_id;
END;

CREATE TRIGGER book_counted_out_after_delete AFTER DELETE ON book BEGIN
    UPDATE series SET book_count = book_count - 1 WHERE local_id = old.series_local_id;
END;

CREATE TRIGGER book_counted_again_after_move AFTER UPDATE OF series_local_id ON book BEGIN
    UPDATE series SET book_count = book_count - 1 WHERE local_id = old.series_local_id;
    UPDATE series SET book_count = book_count + 1 WHERE local_id = new.series_local_id;
END;
