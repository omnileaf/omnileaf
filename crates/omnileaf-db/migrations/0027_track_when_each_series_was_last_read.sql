ALTER TABLE series ADD COLUMN last_read_at_ms INTEGER NOT NULL DEFAULT 0 CHECK (last_read_at_ms >= 0);

UPDATE series SET last_read_at_ms = coalesce((
    SELECT max(reading_session.ended_at_ms) FROM book
    JOIN reading_session ON reading_session.book_id = book.id
    WHERE book.series_local_id = series.local_id
), 0);

CREATE TRIGGER reading_session_marks_series_read_after_insert AFTER INSERT ON reading_session BEGIN
    UPDATE series SET last_read_at_ms = max(last_read_at_ms, new.ended_at_ms)
    WHERE local_id = (SELECT series_local_id FROM book WHERE id = new.book_id);
END;

CREATE TRIGGER reading_session_marks_series_read_after_update AFTER UPDATE OF ended_at_ms ON reading_session BEGIN
    UPDATE series SET last_read_at_ms = max(last_read_at_ms, new.ended_at_ms)
    WHERE local_id = (SELECT series_local_id FROM book WHERE id = new.book_id);
END;

CREATE TRIGGER book_marks_series_read_after_insert AFTER INSERT ON book BEGIN
    UPDATE series SET last_read_at_ms = max(last_read_at_ms, coalesce((
        SELECT max(ended_at_ms) FROM reading_session WHERE book_id = new.id
    ), 0))
    WHERE local_id = new.series_local_id;
END;

CREATE TRIGGER book_marks_series_read_again_after_move AFTER UPDATE OF series_local_id ON book BEGIN
    UPDATE series SET last_read_at_ms = coalesce((
        SELECT max(reading_session.ended_at_ms) FROM book
        JOIN reading_session ON reading_session.book_id = book.id
        WHERE book.series_local_id = series.local_id
    ), 0)
    WHERE local_id IN (old.series_local_id, new.series_local_id);
END;

CREATE INDEX series_by_stage_and_last_read ON series (reading_stage, last_read_at_ms, id)
    WHERE reading_stage IS NOT NULL;

CREATE TABLE library_listing_new (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    sort_order TEXT NOT NULL CHECK (sort_order IN ('title', 'date_added', 'last_read')),
    sort_direction TEXT NOT NULL CHECK (sort_direction IN ('ascending', 'descending')),
    unread TEXT NOT NULL CHECK (unread IN ('any', 'only', 'hide')),
    started TEXT NOT NULL CHECK (started IN ('any', 'only', 'hide')),
    finished TEXT NOT NULL CHECK (finished IN ('any', 'only', 'hide'))
) STRICT;

INSERT INTO library_listing_new SELECT * FROM library_listing;

DROP TABLE library_listing;

ALTER TABLE library_listing_new RENAME TO library_listing;
