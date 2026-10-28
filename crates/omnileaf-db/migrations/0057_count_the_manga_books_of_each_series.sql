ALTER TABLE book_details ADD COLUMN is_manga INTEGER CHECK (is_manga IN (0, 1));

ALTER TABLE series ADD COLUMN manga_books INTEGER NOT NULL DEFAULT 0 CHECK (manga_books >= 0);

CREATE VIEW manga_book (book_id, series_local_id) AS
SELECT book.id, book.series_local_id FROM book
JOIN book_details ON book_details.book_id = book.id
WHERE book_details.is_manga = 1;

CREATE TRIGGER book_details_counted_manga_after_insert AFTER INSERT ON book_details
WHEN new.is_manga = 1
BEGIN
    UPDATE series SET manga_books = manga_books + 1
    WHERE local_id = (SELECT series_local_id FROM book WHERE id = new.book_id);
END;

CREATE TRIGGER book_details_counted_manga_again_after_update AFTER UPDATE OF is_manga ON book_details
WHEN old.is_manga IS NOT new.is_manga
BEGIN
    UPDATE series SET manga_books = manga_books + (new.is_manga IS 1) - (old.is_manga IS 1)
    WHERE local_id = (SELECT series_local_id FROM book WHERE id = new.book_id);
END;

CREATE TRIGGER book_details_counted_manga_out_after_delete AFTER DELETE ON book_details
WHEN old.is_manga = 1
BEGIN
    UPDATE series SET manga_books = manga_books - 1
    WHERE local_id = (SELECT series_local_id FROM book WHERE id = old.book_id);
END;

CREATE TRIGGER book_counted_manga_out_before_delete BEFORE DELETE ON book BEGIN
    UPDATE series SET manga_books = manga_books - 1
    WHERE local_id = old.series_local_id
        AND EXISTS (SELECT 1 FROM manga_book WHERE book_id = old.id);
END;

CREATE TRIGGER book_counted_manga_again_after_move AFTER UPDATE OF series_local_id ON book
WHEN old.series_local_id != new.series_local_id
    AND EXISTS (SELECT 1 FROM manga_book WHERE book_id = new.id)
BEGIN
    UPDATE series SET manga_books = manga_books
        + (local_id = new.series_local_id) - (local_id = old.series_local_id)
    WHERE local_id IN (old.series_local_id, new.series_local_id);
END;

CREATE INDEX series_manga_by_stage ON series (reading_stage) WHERE manga_books > 0;

DROP INDEX series_by_stage_and_time_left;

CREATE INDEX series_by_stage_and_time_left
    ON series (
        reading_stage, time_left_key, id, last_read_at_ms, duplicated_books, language,
        adult_rated_books, manga_books
    )
    WHERE reading_stage IS NOT NULL;

DELETE FROM book_person;
DELETE FROM book_tag;
DELETE FROM book_details;
