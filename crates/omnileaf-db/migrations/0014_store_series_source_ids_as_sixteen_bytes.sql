CREATE TABLE series_new (
    local_id INTEGER PRIMARY KEY,
    id BLOB NOT NULL UNIQUE CHECK (length(id) = 16),
    source_id BLOB NOT NULL CHECK (length(source_id) = 16),
    natural_key TEXT NOT NULL,
    title TEXT NOT NULL,
    title_key BLOB NOT NULL,
    book_count INTEGER NOT NULL DEFAULT 0 CHECK (book_count >= 0),
    added_at_ms INTEGER NOT NULL,
    UNIQUE (source_id, natural_key)
) STRICT;

INSERT INTO series_new (local_id, id, source_id, natural_key, title, title_key, book_count, added_at_ms)
    SELECT local_id, id, x'2f459482bb888f49b795205dedca106b', natural_key, title, title_key, book_count, added_at_ms
    FROM series;

DROP TRIGGER book_counted_after_insert;
DROP TRIGGER book_counted_out_after_delete;
DROP TRIGGER book_counted_again_after_move;

DROP TABLE series;

ALTER TABLE series_new RENAME TO series;

CREATE INDEX series_by_title ON series (title_key, id) WHERE book_count > 0;
CREATE INDEX series_by_added ON series (added_at_ms, id) WHERE book_count > 0;

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

CREATE TRIGGER series_searchable_after_insert AFTER INSERT ON series BEGIN
    INSERT INTO series_fts (rowid, title) VALUES (new.local_id, new.title);
END;

CREATE TRIGGER series_unsearchable_after_delete AFTER DELETE ON series BEGIN
    INSERT INTO series_fts (series_fts, rowid, title) VALUES ('delete', old.local_id, old.title);
END;

CREATE TRIGGER series_searchable_again_after_rename AFTER UPDATE OF title ON series BEGIN
    INSERT INTO series_fts (series_fts, rowid, title) VALUES ('delete', old.local_id, old.title);
    INSERT INTO series_fts (rowid, title) VALUES (new.local_id, new.title);
END;
