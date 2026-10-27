ALTER TABLE series ADD COLUMN duplicated_books INTEGER NOT NULL DEFAULT 0
    CHECK (duplicated_books >= 0);

UPDATE series SET duplicated_books = (
    SELECT count(*) FROM book
    WHERE book.series_local_id = series.local_id
        AND (SELECT count(*) FROM book_file WHERE book_file.book_id = book.id) > 1
);

CREATE TRIGGER book_file_duplicates_book_after_insert AFTER INSERT ON book_file
WHEN (SELECT count(*) FROM book_file WHERE book_id = new.book_id) = 2
BEGIN
    UPDATE series SET duplicated_books = duplicated_books + 1
    WHERE local_id = (SELECT series_local_id FROM book WHERE id = new.book_id);
END;

CREATE TRIGGER book_file_leaves_book_single_after_delete AFTER DELETE ON book_file
WHEN (SELECT count(*) FROM book_file WHERE book_id = old.book_id) = 1
BEGIN
    UPDATE series SET duplicated_books = duplicated_books - 1
    WHERE local_id = (SELECT series_local_id FROM book WHERE id = old.book_id);
END;

CREATE TRIGGER book_file_duplicates_again_after_move AFTER UPDATE OF book_id ON book_file
WHEN old.book_id IS NOT new.book_id
BEGIN
    UPDATE series SET duplicated_books = duplicated_books - 1
    WHERE local_id = (SELECT series_local_id FROM book WHERE id = old.book_id)
        AND (SELECT count(*) FROM book_file WHERE book_id = old.book_id) = 1;
    UPDATE series SET duplicated_books = duplicated_books + 1
    WHERE local_id = (SELECT series_local_id FROM book WHERE id = new.book_id)
        AND (SELECT count(*) FROM book_file WHERE book_id = new.book_id) = 2;
END;

CREATE TRIGGER book_takes_duplicates_back_before_delete BEFORE DELETE ON book
WHEN (SELECT count(*) FROM book_file WHERE book_id = old.id) > 1
BEGIN
    UPDATE series SET duplicated_books = duplicated_books - 1
    WHERE local_id = old.series_local_id;
END;

CREATE TRIGGER book_moves_duplicates_after_move AFTER UPDATE OF series_local_id ON book
WHEN old.series_local_id IS NOT new.series_local_id
    AND (SELECT count(*) FROM book_file WHERE book_id = new.id) > 1
BEGIN
    UPDATE series SET duplicated_books = duplicated_books - 1
    WHERE local_id = old.series_local_id;
    UPDATE series SET duplicated_books = duplicated_books + 1
    WHERE local_id = new.series_local_id;
END;
