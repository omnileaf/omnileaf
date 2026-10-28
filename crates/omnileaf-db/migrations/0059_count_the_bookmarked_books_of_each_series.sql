ALTER TABLE series ADD COLUMN bookmarked_books INTEGER NOT NULL DEFAULT 0 CHECK (bookmarked_books >= 0);

CREATE TRIGGER book_bookmark_counted_after_insert AFTER INSERT ON book_bookmark
WHEN (SELECT count(*) FROM book_bookmark WHERE book_id = new.book_id) = 1
BEGIN
    UPDATE series SET bookmarked_books = bookmarked_books + 1
    WHERE local_id = (SELECT series_local_id FROM book WHERE id = new.book_id);
END;

CREATE TRIGGER book_bookmark_counted_out_after_delete AFTER DELETE ON book_bookmark
WHEN NOT EXISTS (SELECT 1 FROM book_bookmark WHERE book_id = old.book_id)
BEGIN
    UPDATE series SET bookmarked_books = bookmarked_books - 1
    WHERE local_id = (SELECT series_local_id FROM book WHERE id = old.book_id);
END;

CREATE TRIGGER book_counted_bookmarked_after_insert AFTER INSERT ON book
WHEN EXISTS (SELECT 1 FROM book_bookmark WHERE book_id = new.id)
BEGIN
    UPDATE series SET bookmarked_books = bookmarked_books + 1
    WHERE local_id = new.series_local_id;
END;

CREATE TRIGGER book_counted_bookmarked_out_before_delete BEFORE DELETE ON book
WHEN EXISTS (SELECT 1 FROM book_bookmark WHERE book_id = old.id)
BEGIN
    UPDATE series SET bookmarked_books = bookmarked_books - 1
    WHERE local_id = old.series_local_id;
END;

CREATE TRIGGER book_counted_bookmarked_again_after_move AFTER UPDATE OF series_local_id ON book
WHEN old.series_local_id != new.series_local_id
    AND EXISTS (SELECT 1 FROM book_bookmark WHERE book_id = new.id)
BEGIN
    UPDATE series SET bookmarked_books = bookmarked_books
        + (local_id = new.series_local_id) - (local_id = old.series_local_id)
    WHERE local_id IN (old.series_local_id, new.series_local_id);
END;

UPDATE series SET bookmarked_books = (
    SELECT count(DISTINCT book.id) FROM book
    JOIN book_bookmark ON book_bookmark.book_id = book.id
    WHERE book.series_local_id = series.local_id
);

CREATE INDEX series_bookmarked_by_stage ON series (reading_stage) WHERE bookmarked_books > 0;

DROP INDEX series_by_stage_and_time_left;

CREATE INDEX series_by_stage_and_time_left
    ON series (
        reading_stage, time_left_key, id, last_read_at_ms, duplicated_books, language,
        adult_rated_books, manga_books, bookmarked_books
    )
    WHERE reading_stage IS NOT NULL;
