ALTER TABLE series ADD COLUMN language TEXT;

ALTER TABLE series ADD COLUMN adult_rated_books INTEGER NOT NULL DEFAULT 0
    CHECK (adult_rated_books >= 0);

CREATE VIEW adult_age_rating (age_rating) AS VALUES ('adults_only_18'), ('r_18'), ('x_18');

CREATE VIEW series_language (series_local_id, language) AS
SELECT series.local_id, (
    SELECT book_details.language FROM book
    JOIN book_details ON book_details.book_id = book.id
    WHERE book.series_local_id = series.local_id AND book_details.language IS NOT NULL
    ORDER BY book.title_sort_key, book.id
    LIMIT 1
)
FROM series;

CREATE VIEW adult_rated_book (book_id, series_local_id) AS
SELECT book.id, book.series_local_id FROM book
JOIN book_details ON book_details.book_id = book.id
WHERE book_details.age_rating IN adult_age_rating;

UPDATE series SET
    language = (SELECT language FROM series_language WHERE series_local_id = series.local_id),
    adult_rated_books = (
        SELECT count(*) FROM adult_rated_book WHERE series_local_id = series.local_id
    );

CREATE TRIGGER book_details_name_series_after_insert AFTER INSERT ON book_details BEGIN
    UPDATE series SET
        language = (SELECT language FROM series_language WHERE series_local_id = series.local_id)
    WHERE new.language IS NOT NULL
        AND local_id = (SELECT series_local_id FROM book WHERE id = new.book_id);
    UPDATE series SET adult_rated_books = adult_rated_books + 1
    WHERE new.age_rating IN adult_age_rating
        AND local_id = (SELECT series_local_id FROM book WHERE id = new.book_id);
END;

CREATE TRIGGER book_details_name_series_again_after_update
AFTER UPDATE OF language, age_rating ON book_details BEGIN
    UPDATE series SET
        language = (SELECT language FROM series_language WHERE series_local_id = series.local_id)
    WHERE new.language IS NOT old.language
        AND local_id = (SELECT series_local_id FROM book WHERE id = new.book_id);
    UPDATE series SET adult_rated_books = (
        SELECT count(*) FROM adult_rated_book WHERE series_local_id = series.local_id
    )
    WHERE new.age_rating IS NOT old.age_rating
        AND local_id = (SELECT series_local_id FROM book WHERE id = new.book_id);
END;

CREATE TRIGGER book_details_name_series_again_after_delete AFTER DELETE ON book_details BEGIN
    UPDATE series SET
        language = (SELECT language FROM series_language WHERE series_local_id = series.local_id)
    WHERE old.language IS NOT NULL
        AND local_id = (SELECT series_local_id FROM book WHERE id = old.book_id);
    UPDATE series SET adult_rated_books = adult_rated_books - 1
    WHERE old.age_rating IN adult_age_rating
        AND local_id = (SELECT series_local_id FROM book WHERE id = old.book_id);
END;

CREATE TRIGGER book_takes_its_rating_from_series_before_delete BEFORE DELETE ON book BEGIN
    UPDATE series SET adult_rated_books = adult_rated_books - 1
    WHERE local_id = old.series_local_id
        AND EXISTS (SELECT 1 FROM adult_rated_book WHERE book_id = old.id);
END;

CREATE TRIGGER book_names_series_again_after_delete AFTER DELETE ON book BEGIN
    UPDATE series SET
        language = (SELECT language FROM series_language WHERE series_local_id = series.local_id)
    WHERE local_id = old.series_local_id AND language IS NOT NULL;
END;

CREATE TRIGGER book_names_series_again_after_move
AFTER UPDATE OF series_local_id, title_sort_key ON book BEGIN
    UPDATE series SET
        language = (SELECT language FROM series_language WHERE series_local_id = series.local_id)
    WHERE local_id IN (old.series_local_id, new.series_local_id)
        AND EXISTS (
            SELECT 1 FROM book_details WHERE book_id = new.id AND language IS NOT NULL
        );
    UPDATE series SET adult_rated_books = adult_rated_books
        + (local_id = new.series_local_id) - (local_id = old.series_local_id)
    WHERE local_id IN (old.series_local_id, new.series_local_id)
        AND old.series_local_id != new.series_local_id
        AND EXISTS (SELECT 1 FROM adult_rated_book WHERE book_id = new.id);
END;
