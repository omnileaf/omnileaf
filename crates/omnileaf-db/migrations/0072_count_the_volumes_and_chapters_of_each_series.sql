ALTER TABLE series ADD COLUMN volume_books INTEGER NOT NULL DEFAULT 0 CHECK (volume_books >= 0);

ALTER TABLE series ADD COLUMN chapter_books INTEGER NOT NULL DEFAULT 0 CHECK (chapter_books >= 0);

UPDATE series SET
    volume_books = (
        SELECT count(*) FROM book WHERE book.series_local_id = series.local_id AND book.kind = 'volume'
    ),
    chapter_books = (
        SELECT count(*) FROM book WHERE book.series_local_id = series.local_id AND book.kind = 'chapter'
    );

CREATE TRIGGER book_kind_counted_after_insert AFTER INSERT ON book
WHEN new.kind IN ('volume', 'chapter')
BEGIN
    UPDATE series SET
        volume_books = volume_books + (new.kind IS 'volume'),
        chapter_books = chapter_books + (new.kind IS 'chapter')
    WHERE local_id = new.series_local_id;
END;

CREATE TRIGGER book_kind_counted_out_after_delete AFTER DELETE ON book
WHEN old.kind IN ('volume', 'chapter')
BEGIN
    UPDATE series SET
        volume_books = volume_books - (old.kind IS 'volume'),
        chapter_books = chapter_books - (old.kind IS 'chapter')
    WHERE local_id = old.series_local_id;
END;

CREATE TRIGGER book_kind_counted_again_after_update AFTER UPDATE OF kind, series_local_id ON book
WHEN old.kind IS NOT new.kind OR old.series_local_id != new.series_local_id
BEGIN
    UPDATE series SET
        volume_books = volume_books - (old.kind IS 'volume'),
        chapter_books = chapter_books - (old.kind IS 'chapter')
    WHERE local_id = old.series_local_id;
    UPDATE series SET
        volume_books = volume_books + (new.kind IS 'volume'),
        chapter_books = chapter_books + (new.kind IS 'chapter')
    WHERE local_id = new.series_local_id;
END;
