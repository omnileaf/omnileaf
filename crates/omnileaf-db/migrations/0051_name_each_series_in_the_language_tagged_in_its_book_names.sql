DELETE FROM book_person;
DELETE FROM book_tag;
DELETE FROM book_details;

DROP TRIGGER book_details_name_series_after_insert;
DROP TRIGGER book_details_name_series_again_after_update;
DROP TRIGGER book_details_name_series_again_after_delete;
DROP TRIGGER book_names_series_again_after_delete;
DROP TRIGGER book_names_series_again_after_move;
DROP VIEW series_language;

ALTER TABLE book ADD COLUMN name_language TEXT;

ALTER TABLE series ADD COLUMN language_source TEXT
    CHECK (language_source IN ('folder_name', 'file_name', 'files'))
    CHECK ((language_source IS NULL) = (language IS NULL));

CREATE VIEW series_language (series_local_id, language, language_source) AS
SELECT series.local_id, coalesce(book_details.language, book.name_language), CASE
    WHEN book_details.language IS NOT NULL THEN 'files'
    WHEN book.name_language IS NOT NULL THEN 'file_name'
END
FROM series
LEFT JOIN book ON book.id = (
    SELECT named.id FROM book AS named
    LEFT JOIN book_details AS named_details ON named_details.book_id = named.id
    WHERE named.series_local_id = series.local_id
        AND coalesce(named_details.language, named.name_language) IS NOT NULL
    ORDER BY named.reading_order_key, named.id
    LIMIT 1
)
LEFT JOIN book_details ON book_details.book_id = book.id;

UPDATE series SET (language, language_source) = (
    SELECT language, language_source FROM series_language WHERE series_local_id = series.local_id
);

CREATE TRIGGER book_details_name_series_after_insert AFTER INSERT ON book_details BEGIN
    UPDATE series SET (language, language_source) = (
        SELECT language, language_source FROM series_language
        WHERE series_local_id = series.local_id
    )
    WHERE new.language IS NOT NULL
        AND local_id = (SELECT series_local_id FROM book WHERE id = new.book_id);
    UPDATE series SET adult_rated_books = adult_rated_books + 1
    WHERE new.age_rating IN adult_age_rating
        AND local_id = (SELECT series_local_id FROM book WHERE id = new.book_id);
END;

CREATE TRIGGER book_details_name_series_again_after_update
AFTER UPDATE OF language, age_rating ON book_details BEGIN
    UPDATE series SET (language, language_source) = (
        SELECT language, language_source FROM series_language
        WHERE series_local_id = series.local_id
    )
    WHERE new.language IS NOT old.language
        AND local_id = (SELECT series_local_id FROM book WHERE id = new.book_id);
    UPDATE series SET adult_rated_books = (
        SELECT count(*) FROM adult_rated_book WHERE series_local_id = series.local_id
    )
    WHERE new.age_rating IS NOT old.age_rating
        AND local_id = (SELECT series_local_id FROM book WHERE id = new.book_id);
END;

CREATE TRIGGER book_details_name_series_again_after_delete AFTER DELETE ON book_details BEGIN
    UPDATE series SET (language, language_source) = (
        SELECT language, language_source FROM series_language
        WHERE series_local_id = series.local_id
    )
    WHERE old.language IS NOT NULL
        AND local_id = (SELECT series_local_id FROM book WHERE id = old.book_id);
    UPDATE series SET adult_rated_books = adult_rated_books - 1
    WHERE old.age_rating IN adult_age_rating
        AND local_id = (SELECT series_local_id FROM book WHERE id = old.book_id);
END;

CREATE TRIGGER book_names_series_after_insert AFTER INSERT ON book
WHEN new.name_language IS NOT NULL
BEGIN
    UPDATE series SET (language, language_source) = (
        SELECT language, language_source FROM series_language
        WHERE series_local_id = series.local_id
    )
    WHERE local_id = new.series_local_id;
END;

CREATE TRIGGER book_names_series_again_after_delete AFTER DELETE ON book BEGIN
    UPDATE series SET (language, language_source) = (
        SELECT language, language_source FROM series_language
        WHERE series_local_id = series.local_id
    )
    WHERE local_id = old.series_local_id AND language IS NOT NULL;
END;

CREATE TRIGGER book_names_series_again_after_move
AFTER UPDATE OF series_local_id, reading_order_key, name_language ON book BEGIN
    UPDATE series SET (language, language_source) = (
        SELECT language, language_source FROM series_language
        WHERE series_local_id = series.local_id
    )
    WHERE local_id IN (old.series_local_id, new.series_local_id)
        AND (
            old.name_language IS NOT NULL
            OR new.name_language IS NOT NULL
            OR EXISTS (
                SELECT 1 FROM book_details WHERE book_id = new.id AND language IS NOT NULL
            )
        );
    UPDATE series SET adult_rated_books = adult_rated_books
        + (local_id = new.series_local_id) - (local_id = old.series_local_id)
    WHERE local_id IN (old.series_local_id, new.series_local_id)
        AND old.series_local_id != new.series_local_id
        AND EXISTS (SELECT 1 FROM adult_rated_book WHERE book_id = new.id);
END;
