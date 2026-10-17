ALTER TABLE series ADD COLUMN updated_at_ms INTEGER NOT NULL DEFAULT 0;

CREATE INDEX book_by_series_and_added ON book (series_local_id, added_at_ms);

UPDATE series SET updated_at_ms = coalesce((
    SELECT max(added_at_ms) FROM book WHERE series_local_id = series.local_id
), 0);

CREATE TRIGGER book_updates_series_after_insert AFTER INSERT ON book BEGIN
    UPDATE series SET updated_at_ms = max(updated_at_ms, new.added_at_ms)
    WHERE local_id = new.series_local_id;
END;

CREATE TRIGGER book_updates_series_again_after_delete AFTER DELETE ON book BEGIN
    UPDATE series SET updated_at_ms = coalesce((
        SELECT max(added_at_ms) FROM book WHERE series_local_id = series.local_id
    ), 0)
    WHERE local_id = old.series_local_id AND updated_at_ms <= old.added_at_ms;
END;

CREATE TRIGGER book_updates_series_again_after_move AFTER UPDATE OF series_local_id ON book BEGIN
    UPDATE series SET updated_at_ms = coalesce((
        SELECT max(added_at_ms) FROM book WHERE series_local_id = series.local_id
    ), 0)
    WHERE local_id IN (old.series_local_id, new.series_local_id);
END;

CREATE INDEX series_by_stage_and_updated ON series (reading_stage, updated_at_ms, id)
    WHERE reading_stage IS NOT NULL;

CREATE TABLE library_listing_new (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    sort_order TEXT NOT NULL
        CHECK (sort_order IN ('title', 'date_added', 'last_read', 'last_updated')),
    sort_direction TEXT NOT NULL CHECK (sort_direction IN ('ascending', 'descending')),
    unread TEXT NOT NULL CHECK (unread IN ('any', 'only', 'hide')),
    started TEXT NOT NULL CHECK (started IN ('any', 'only', 'hide')),
    finished TEXT NOT NULL CHECK (finished IN ('any', 'only', 'hide'))
) STRICT;

INSERT INTO library_listing_new SELECT * FROM library_listing;

DROP TABLE library_listing;

ALTER TABLE library_listing_new RENAME TO library_listing;
