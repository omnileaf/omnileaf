ALTER TABLE series ADD COLUMN reading_stage INTEGER
    GENERATED ALWAYS AS (
        CASE
            WHEN book_count = 0 THEN NULL
            WHEN read_count >= book_count THEN 2
            WHEN started_count > 0 THEN 1
            ELSE 0
        END
    ) VIRTUAL;

DROP INDEX series_by_title;

CREATE INDEX series_by_stage_and_title ON series (reading_stage, title_key, id)
    WHERE reading_stage IS NOT NULL;

DROP INDEX series_by_added;

CREATE INDEX series_by_stage_and_added ON series (reading_stage, added_at_ms, id)
    WHERE reading_stage IS NOT NULL;
