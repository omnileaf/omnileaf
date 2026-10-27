ALTER TABLE series ADD COLUMN year INTEGER CHECK (year BETWEEN 1000 AND 2999);

ALTER TABLE series ADD COLUMN year_source TEXT
    CHECK (year_source IN ('folder_name', 'file_name', 'files'))
    CHECK ((year_source IS NULL) = (year IS NULL));

ALTER TABLE series ADD COLUMN title_source TEXT
    CHECK (title_source IN ('folder_name', 'file_name', 'files'));

CREATE TRIGGER book_carries_series_added_time_after_move AFTER UPDATE OF series_local_id ON book
WHEN old.series_local_id IS NOT new.series_local_id
BEGIN
    UPDATE series SET added_at_ms = left_behind.added_at_ms
    FROM series AS left_behind
    WHERE series.local_id = new.series_local_id
        AND left_behind.local_id = old.series_local_id
        AND left_behind.added_at_ms < series.added_at_ms;
END;

DELETE FROM book_person;
DELETE FROM book_tag;
DELETE FROM book_details;
