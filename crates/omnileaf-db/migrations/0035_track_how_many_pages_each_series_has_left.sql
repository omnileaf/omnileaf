ALTER TABLE series ADD COLUMN pages_left INTEGER NOT NULL DEFAULT 0 CHECK (pages_left >= 0);

ALTER TABLE series ADD COLUMN uncounted_books INTEGER NOT NULL DEFAULT 0
    CHECK (uncounted_books >= 0);

ALTER TABLE series ADD COLUMN time_left_key INTEGER
    GENERATED ALWAYS AS (
        CASE WHEN uncounted_books > 0 THEN 9223372036854775807 ELSE pages_left END
    ) VIRTUAL;

CREATE VIEW book_left_to_read AS
SELECT book.id AS book_id, book.series_local_id AS series_local_id,
    CASE
        WHEN book_state.is_read IS 1 OR book.page_count IS NULL THEN 0
        ELSE max(book.page_count
            - coalesce(book_state.position_page, book_state.furthest_page, 0), 0)
    END AS pages_left,
    (book_state.is_read IS NOT 1 AND book.page_count IS NULL) AS is_uncounted
FROM book
LEFT JOIN book_state ON book_state.book_id = book.id;

UPDATE series SET
    pages_left = coalesce((
        SELECT sum(pages_left) FROM book_left_to_read WHERE series_local_id = series.local_id
    ), 0),
    uncounted_books = coalesce((
        SELECT sum(is_uncounted) FROM book_left_to_read WHERE series_local_id = series.local_id
    ), 0);

CREATE TRIGGER book_state_leaves_pages_after_insert AFTER INSERT ON book_state BEGIN
    UPDATE series SET
        pages_left = series.pages_left + book_left.pages_left - coalesce(book.page_count, 0),
        uncounted_books = series.uncounted_books + book_left.is_uncounted - (book.page_count IS NULL)
    FROM book_left_to_read AS book_left
    JOIN book ON book.id = book_left.book_id
    WHERE book_left.book_id = new.book_id AND series.local_id = book_left.series_local_id;
END;

CREATE TRIGGER book_state_takes_pages_back_before_update
BEFORE UPDATE OF is_read, position_page, furthest_page ON book_state BEGIN
    UPDATE series SET
        pages_left = series.pages_left - book_left.pages_left,
        uncounted_books = series.uncounted_books - book_left.is_uncounted
    FROM book_left_to_read AS book_left
    WHERE book_left.book_id = old.book_id AND series.local_id = book_left.series_local_id;
END;

CREATE TRIGGER book_state_leaves_pages_after_update
AFTER UPDATE OF is_read, position_page, furthest_page ON book_state BEGIN
    UPDATE series SET
        pages_left = series.pages_left + book_left.pages_left,
        uncounted_books = series.uncounted_books + book_left.is_uncounted
    FROM book_left_to_read AS book_left
    WHERE book_left.book_id = new.book_id AND series.local_id = book_left.series_local_id;
END;

CREATE TRIGGER book_state_takes_pages_back_before_delete BEFORE DELETE ON book_state BEGIN
    UPDATE series SET
        pages_left = series.pages_left - book_left.pages_left + coalesce(book.page_count, 0),
        uncounted_books = series.uncounted_books - book_left.is_uncounted + (book.page_count IS NULL)
    FROM book_left_to_read AS book_left
    JOIN book ON book.id = book_left.book_id
    WHERE book_left.book_id = old.book_id AND series.local_id = book_left.series_local_id;
END;

CREATE TRIGGER book_leaves_pages_after_insert AFTER INSERT ON book BEGIN
    UPDATE series SET
        pages_left = series.pages_left + book_left.pages_left,
        uncounted_books = series.uncounted_books + book_left.is_uncounted
    FROM book_left_to_read AS book_left
    WHERE book_left.book_id = new.id AND series.local_id = book_left.series_local_id;
END;

CREATE TRIGGER book_takes_pages_back_before_update
BEFORE UPDATE OF series_local_id, page_count ON book BEGIN
    UPDATE series SET
        pages_left = series.pages_left - book_left.pages_left,
        uncounted_books = series.uncounted_books - book_left.is_uncounted
    FROM book_left_to_read AS book_left
    WHERE book_left.book_id = old.id AND series.local_id = book_left.series_local_id;
END;

CREATE TRIGGER book_leaves_pages_after_update
AFTER UPDATE OF series_local_id, page_count ON book BEGIN
    UPDATE series SET
        pages_left = series.pages_left + book_left.pages_left,
        uncounted_books = series.uncounted_books + book_left.is_uncounted
    FROM book_left_to_read AS book_left
    WHERE book_left.book_id = new.id AND series.local_id = book_left.series_local_id;
END;

CREATE TRIGGER book_takes_pages_back_before_delete BEFORE DELETE ON book BEGIN
    UPDATE series SET
        pages_left = series.pages_left - book_left.pages_left,
        uncounted_books = series.uncounted_books - book_left.is_uncounted
    FROM book_left_to_read AS book_left
    WHERE book_left.book_id = old.id AND series.local_id = book_left.series_local_id;
END;

CREATE INDEX series_by_stage_and_time_left ON series (reading_stage, time_left_key, id)
    WHERE reading_stage IS NOT NULL;

CREATE TABLE library_listing_new (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    sort_order TEXT NOT NULL CHECK (
        sort_order IN (
            'title', 'date_added', 'last_read', 'last_updated', 'unread_count', 'time_left'
        )
    ),
    sort_direction TEXT NOT NULL CHECK (sort_direction IN ('ascending', 'descending')),
    unread TEXT NOT NULL CHECK (unread IN ('any', 'only', 'hide')),
    started TEXT NOT NULL CHECK (started IN ('any', 'only', 'hide')),
    finished TEXT NOT NULL CHECK (finished IN ('any', 'only', 'hide'))
) STRICT;

INSERT INTO library_listing_new SELECT * FROM library_listing;

DROP TABLE library_listing;

ALTER TABLE library_listing_new RENAME TO library_listing;
