CREATE TABLE series_tag (
    series_local_id INTEGER NOT NULL REFERENCES series (local_id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    book_count INTEGER NOT NULL CHECK (book_count > 0),
    PRIMARY KEY (series_local_id, name)
) STRICT, WITHOUT ROWID;

CREATE INDEX series_tag_by_name ON series_tag (name, series_local_id);

INSERT INTO series_tag (series_local_id, name, book_count)
SELECT book.series_local_id, book_tag.name, count(DISTINCT book.id)
FROM book_tag JOIN book ON book.id = book_tag.book_id
GROUP BY book.series_local_id, book_tag.name;

CREATE TRIGGER book_tag_counted_after_insert AFTER INSERT ON book_tag
WHEN NOT EXISTS (
    SELECT 1 FROM book_tag AS other
    WHERE other.book_id = new.book_id AND other.name = new.name AND other.kind IS NOT new.kind
)
BEGIN
    INSERT INTO series_tag (series_local_id, name, book_count)
    SELECT book.series_local_id, new.name, 1 FROM book WHERE book.id = new.book_id
    ON CONFLICT (series_local_id, name) DO UPDATE SET book_count = book_count + 1;
END;

CREATE TRIGGER book_tag_counted_out_after_delete AFTER DELETE ON book_tag
WHEN NOT EXISTS (
    SELECT 1 FROM book_tag AS other WHERE other.book_id = old.book_id AND other.name = old.name
)
BEGIN
    DELETE FROM series_tag
    WHERE book_count = 1 AND name = old.name
        AND series_local_id = (SELECT series_local_id FROM book WHERE id = old.book_id);
    UPDATE series_tag SET book_count = book_count - 1
    WHERE book_count > 1 AND name = old.name
        AND series_local_id = (SELECT series_local_id FROM book WHERE id = old.book_id);
END;

CREATE TRIGGER book_tags_counted_out_before_delete BEFORE DELETE ON book BEGIN
    DELETE FROM series_tag
    WHERE series_local_id = old.series_local_id AND book_count = 1
        AND name IN (SELECT name FROM book_tag WHERE book_id = old.id);
    UPDATE series_tag SET book_count = book_count - 1
    WHERE series_local_id = old.series_local_id AND book_count > 1
        AND name IN (SELECT name FROM book_tag WHERE book_id = old.id);
END;

CREATE TRIGGER book_tags_counted_again_after_move AFTER UPDATE OF series_local_id ON book BEGIN
    DELETE FROM series_tag
    WHERE series_local_id = old.series_local_id AND book_count = 1
        AND name IN (SELECT name FROM book_tag WHERE book_id = old.id);
    UPDATE series_tag SET book_count = book_count - 1
    WHERE series_local_id = old.series_local_id AND book_count > 1
        AND name IN (SELECT name FROM book_tag WHERE book_id = old.id);
    INSERT INTO series_tag (series_local_id, name, book_count)
    SELECT DISTINCT new.series_local_id, name, 1 FROM book_tag WHERE book_id = new.id
    ON CONFLICT (series_local_id, name) DO UPDATE SET book_count = book_count + 1;
END;
