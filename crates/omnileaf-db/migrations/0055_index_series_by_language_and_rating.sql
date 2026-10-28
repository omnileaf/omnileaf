DROP INDEX series_by_stage_and_time_left;

CREATE INDEX series_by_stage_and_time_left
    ON series (
        reading_stage, time_left_key, id, last_read_at_ms, duplicated_books, language,
        adult_rated_books
    )
    WHERE reading_stage IS NOT NULL;

CREATE INDEX series_by_language ON series (language, reading_stage);

CREATE INDEX series_rated_adult_by_stage ON series (reading_stage)
    WHERE adult_rated_books > 0;
