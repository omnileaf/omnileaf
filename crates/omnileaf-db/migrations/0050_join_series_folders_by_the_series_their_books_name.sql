CREATE TABLE series_folder (
    root_id INTEGER NOT NULL REFERENCES library_root (id) ON DELETE CASCADE,
    location BLOB NOT NULL,
    series_local_id INTEGER NOT NULL REFERENCES series (local_id),
    group_location BLOB NOT NULL,
    year INTEGER CHECK (year BETWEEN 1000 AND 2999),
    PRIMARY KEY (root_id, location)
) STRICT;

CREATE INDEX series_folder_by_series ON series_folder (series_local_id);

DELETE FROM book_person;
DELETE FROM book_tag;
DELETE FROM book_details;

CREATE VIEW series_year (series_local_id, year, year_source) AS
SELECT local_id, coalesce(year_in_files, year_in_folder_name), CASE
    WHEN year_in_files IS NOT NULL THEN 'files'
    WHEN year_in_folder_name IS NOT NULL THEN 'folder_name'
END
FROM (
    SELECT series.local_id, (
        SELECT min(book_details.year) FROM book
        JOIN book_details ON book_details.book_id = book.id
        WHERE book.series_local_id = series.local_id
            AND book_details.year BETWEEN 1000 AND 2999
    ) AS year_in_files, (
        SELECT min(series_folder.year) FROM series_folder
        WHERE series_folder.series_local_id = series.local_id
    ) AS year_in_folder_name
    FROM series
);

CREATE TRIGGER book_details_date_series_after_insert AFTER INSERT ON book_details
WHEN new.year IS NOT NULL
BEGIN
    UPDATE series SET year = new.year, year_source = 'files'
    WHERE local_id = (SELECT series_local_id FROM book WHERE id = new.book_id)
        AND new.year BETWEEN 1000 AND 2999
        AND (year_source IS NOT 'files' OR year > new.year);
END;

CREATE TRIGGER book_details_date_series_again_after_update AFTER UPDATE OF year ON book_details
WHEN new.year IS NOT old.year
BEGIN
    UPDATE series SET year = dated.year, year_source = dated.year_source
    FROM series_year AS dated
    WHERE series.local_id = (SELECT series_local_id FROM book WHERE id = new.book_id)
        AND dated.series_local_id = series.local_id
        AND series.year_source = 'files' AND series.year = old.year
        AND (series.year IS NOT dated.year OR series.year_source IS NOT dated.year_source);
    UPDATE series SET year = new.year, year_source = 'files'
    WHERE local_id = (SELECT series_local_id FROM book WHERE id = new.book_id)
        AND new.year BETWEEN 1000 AND 2999
        AND (year_source IS NOT 'files' OR year > new.year);
END;

CREATE TRIGGER book_details_date_series_again_after_delete AFTER DELETE ON book_details
WHEN old.year IS NOT NULL
BEGIN
    UPDATE series SET year = dated.year, year_source = dated.year_source
    FROM series_year AS dated
    WHERE series.local_id = (SELECT series_local_id FROM book WHERE id = old.book_id)
        AND dated.series_local_id = series.local_id
        AND series.year_source = 'files' AND series.year = old.year
        AND (series.year IS NOT dated.year OR series.year_source IS NOT dated.year_source);
END;

CREATE TRIGGER book_gives_up_its_year_before_delete BEFORE DELETE ON book BEGIN
    UPDATE book_details SET year = NULL WHERE book_id = old.id AND year IS NOT NULL;
END;

CREATE TRIGGER book_dates_series_again_after_move AFTER UPDATE OF series_local_id ON book
WHEN old.series_local_id IS NOT new.series_local_id
    AND EXISTS (SELECT 1 FROM book_details WHERE book_id = new.id AND year IS NOT NULL)
BEGIN
    UPDATE series
    SET year = (SELECT year FROM book_details WHERE book_id = new.id), year_source = 'files'
    WHERE local_id = new.series_local_id
        AND (SELECT year FROM book_details WHERE book_id = new.id) BETWEEN 1000 AND 2999
        AND (
            year_source IS NOT 'files'
            OR year > (SELECT year FROM book_details WHERE book_id = new.id)
        );
    UPDATE series SET year = dated.year, year_source = dated.year_source
    FROM series_year AS dated
    WHERE series.local_id = old.series_local_id AND dated.series_local_id = series.local_id
        AND series.year_source = 'files'
        AND series.year = (SELECT year FROM book_details WHERE book_id = new.id)
        AND (series.year IS NOT dated.year OR series.year_source IS NOT dated.year_source);
END;

CREATE TRIGGER series_folder_dates_series_after_insert AFTER INSERT ON series_folder
WHEN new.year IS NOT NULL
BEGIN
    UPDATE series SET year = new.year, year_source = 'folder_name'
    WHERE local_id = new.series_local_id AND new.year IS NOT NULL
        AND (year_source IS NULL OR (year_source = 'folder_name' AND year > new.year));
END;

CREATE TRIGGER series_folder_dates_series_again_after_move
AFTER UPDATE OF series_local_id ON series_folder
WHEN old.series_local_id IS NOT new.series_local_id AND old.year IS NOT NULL
BEGIN
    UPDATE series SET year = new.year, year_source = 'folder_name'
    WHERE local_id = new.series_local_id AND new.year IS NOT NULL
        AND (year_source IS NULL OR (year_source = 'folder_name' AND year > new.year));
    UPDATE series SET year = dated.year, year_source = dated.year_source
    FROM series_year AS dated
    WHERE series.local_id = old.series_local_id AND dated.series_local_id = series.local_id
        AND series.year_source = 'folder_name' AND series.year = old.year
        AND (series.year IS NOT dated.year OR series.year_source IS NOT dated.year_source);
END;

CREATE TRIGGER series_folder_dates_series_again_after_delete AFTER DELETE ON series_folder
WHEN old.year IS NOT NULL
BEGIN
    UPDATE series SET year = dated.year, year_source = dated.year_source
    FROM series_year AS dated
    WHERE series.local_id = old.series_local_id AND dated.series_local_id = series.local_id
        AND series.year_source = 'folder_name' AND series.year = old.year
        AND (series.year IS NOT dated.year OR series.year_source IS NOT dated.year_source);
END;
