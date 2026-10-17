ALTER TABLE library_root ADD COLUMN shows_while_missing INTEGER NOT NULL DEFAULT 0
    CHECK (shows_while_missing IN (0, 1));

ALTER TABLE series ADD COLUMN is_out_of_reach INTEGER NOT NULL DEFAULT 0
    CHECK (is_out_of_reach IN (0, 1));

CREATE VIEW series_file_reach AS
SELECT book.series_local_id AS series_local_id,
    (library_root.unavailable_since_ms IS NULL OR library_root.shows_while_missing) AS is_reachable
FROM book_file
JOIN book ON book.id = book_file.book_id
JOIN library_root ON library_root.id = book_file.root_id;

UPDATE series SET is_out_of_reach = (
    EXISTS (SELECT 1 FROM series_file_reach AS reach WHERE reach.series_local_id = series.local_id)
    AND NOT EXISTS (
        SELECT 1 FROM series_file_reach AS reach
        WHERE reach.series_local_id = series.local_id AND reach.is_reachable
    )
);

CREATE TRIGGER library_root_reach_after_change
AFTER UPDATE OF unavailable_since_ms, shows_while_missing ON library_root
WHEN (old.unavailable_since_ms IS NULL) IS NOT (new.unavailable_since_ms IS NULL)
    OR old.shows_while_missing IS NOT new.shows_while_missing
BEGIN
    UPDATE series SET is_out_of_reach = (
        EXISTS (SELECT 1 FROM series_file_reach AS reach WHERE reach.series_local_id = series.local_id)
        AND NOT EXISTS (
            SELECT 1 FROM series_file_reach AS reach
            WHERE reach.series_local_id = series.local_id AND reach.is_reachable
        )
    )
    WHERE local_id IN (
        SELECT book.series_local_id FROM book_file
        JOIN book ON book.id = book_file.book_id
        WHERE book_file.root_id = new.id
    );
END;

CREATE TRIGGER book_file_reach_after_insert AFTER INSERT ON book_file BEGIN
    UPDATE series SET is_out_of_reach = (
        EXISTS (SELECT 1 FROM series_file_reach AS reach WHERE reach.series_local_id = series.local_id)
        AND NOT EXISTS (
            SELECT 1 FROM series_file_reach AS reach
            WHERE reach.series_local_id = series.local_id AND reach.is_reachable
        )
    )
    WHERE local_id = (SELECT series_local_id FROM book WHERE id = new.book_id);
END;

CREATE TRIGGER book_file_reach_after_delete AFTER DELETE ON book_file BEGIN
    UPDATE series SET is_out_of_reach = (
        EXISTS (SELECT 1 FROM series_file_reach AS reach WHERE reach.series_local_id = series.local_id)
        AND NOT EXISTS (
            SELECT 1 FROM series_file_reach AS reach
            WHERE reach.series_local_id = series.local_id AND reach.is_reachable
        )
    )
    WHERE local_id = (SELECT series_local_id FROM book WHERE id = old.book_id);
END;

CREATE TRIGGER book_file_reach_after_move AFTER UPDATE OF root_id, book_id ON book_file BEGIN
    UPDATE series SET is_out_of_reach = (
        EXISTS (SELECT 1 FROM series_file_reach AS reach WHERE reach.series_local_id = series.local_id)
        AND NOT EXISTS (
            SELECT 1 FROM series_file_reach AS reach
            WHERE reach.series_local_id = series.local_id AND reach.is_reachable
        )
    )
    WHERE local_id IN (
        SELECT series_local_id FROM book WHERE id IN (old.book_id, new.book_id)
    );
END;

CREATE TRIGGER book_reach_after_move AFTER UPDATE OF series_local_id ON book BEGIN
    UPDATE series SET is_out_of_reach = (
        EXISTS (SELECT 1 FROM series_file_reach AS reach WHERE reach.series_local_id = series.local_id)
        AND NOT EXISTS (
            SELECT 1 FROM series_file_reach AS reach
            WHERE reach.series_local_id = series.local_id AND reach.is_reachable
        )
    )
    WHERE local_id IN (old.series_local_id, new.series_local_id);
END;

CREATE TRIGGER book_reach_after_delete AFTER DELETE ON book BEGIN
    UPDATE series SET is_out_of_reach = (
        EXISTS (SELECT 1 FROM series_file_reach AS reach WHERE reach.series_local_id = series.local_id)
        AND NOT EXISTS (
            SELECT 1 FROM series_file_reach AS reach
            WHERE reach.series_local_id = series.local_id AND reach.is_reachable
        )
    )
    WHERE local_id = old.series_local_id;
END;

CREATE INDEX series_out_of_reach ON series (local_id) WHERE is_out_of_reach;

DROP INDEX series_by_stage_and_title;

DROP INDEX series_by_stage_and_added;

DROP INDEX series_by_stage_and_last_read;

ALTER TABLE series DROP COLUMN reading_stage;

ALTER TABLE series ADD COLUMN reading_stage INTEGER
    GENERATED ALWAYS AS (
        CASE
            WHEN book_count = 0 OR is_out_of_reach THEN NULL
            WHEN read_count >= book_count THEN 2
            WHEN started_count > 0 THEN 1
            ELSE 0
        END
    ) VIRTUAL;

CREATE INDEX series_by_stage_and_title ON series (reading_stage, title_key, id)
    WHERE reading_stage IS NOT NULL;

CREATE INDEX series_by_stage_and_added ON series (reading_stage, added_at_ms, id)
    WHERE reading_stage IS NOT NULL;

CREATE INDEX series_by_stage_and_last_read ON series (reading_stage, last_read_at_ms, id)
    WHERE reading_stage IS NOT NULL;
