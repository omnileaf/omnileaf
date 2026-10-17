ALTER TABLE series ADD COLUMN unread_count INTEGER
    GENERATED ALWAYS AS (book_count - read_count) VIRTUAL;

CREATE INDEX series_by_stage_and_unread ON series (reading_stage, unread_count, id)
    WHERE reading_stage IS NOT NULL;

CREATE TABLE library_listing_new (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    sort_order TEXT NOT NULL CHECK (
        sort_order IN ('title', 'date_added', 'last_read', 'last_updated', 'unread_count')
    ),
    sort_direction TEXT NOT NULL CHECK (sort_direction IN ('ascending', 'descending')),
    unread TEXT NOT NULL CHECK (unread IN ('any', 'only', 'hide')),
    started TEXT NOT NULL CHECK (started IN ('any', 'only', 'hide')),
    finished TEXT NOT NULL CHECK (finished IN ('any', 'only', 'hide'))
) STRICT;

INSERT INTO library_listing_new SELECT * FROM library_listing;

DROP TABLE library_listing;

ALTER TABLE library_listing_new RENAME TO library_listing;
