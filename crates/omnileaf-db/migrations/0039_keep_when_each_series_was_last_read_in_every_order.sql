DROP INDEX series_by_stage_and_title;

CREATE INDEX series_by_stage_and_title ON series (reading_stage, title_key, id, last_read_at_ms)
    WHERE reading_stage IS NOT NULL;

DROP INDEX series_by_stage_and_added;

CREATE INDEX series_by_stage_and_added ON series (reading_stage, added_at_ms, id, last_read_at_ms)
    WHERE reading_stage IS NOT NULL;

DROP INDEX series_by_stage_and_updated;

CREATE INDEX series_by_stage_and_updated
    ON series (reading_stage, updated_at_ms, id, last_read_at_ms)
    WHERE reading_stage IS NOT NULL;

DROP INDEX series_by_stage_and_unread;

CREATE INDEX series_by_stage_and_unread ON series (reading_stage, unread_count, id, last_read_at_ms)
    WHERE reading_stage IS NOT NULL;

DROP INDEX series_by_stage_and_time_left;

CREATE INDEX series_by_stage_and_time_left
    ON series (reading_stage, time_left_key, id, last_read_at_ms)
    WHERE reading_stage IS NOT NULL;
