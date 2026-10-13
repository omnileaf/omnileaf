ALTER TABLE book_state ADD COLUMN is_started INTEGER
    GENERATED ALWAYS AS (is_read IS 1 OR position_page IS NOT NULL OR furthest_page IS NOT NULL) VIRTUAL;

ALTER TABLE series ADD COLUMN read_count INTEGER NOT NULL DEFAULT 0 CHECK (read_count >= 0);

ALTER TABLE series ADD COLUMN started_count INTEGER NOT NULL DEFAULT 0 CHECK (started_count >= 0);

UPDATE series SET
    read_count = (
        SELECT count(*) FROM book JOIN book_state ON book_state.book_id = book.id
        WHERE book.series_local_id = series.local_id AND book_state.is_read IS 1
    ),
    started_count = (
        SELECT count(*) FROM book JOIN book_state ON book_state.book_id = book.id
        WHERE book.series_local_id = series.local_id AND book_state.is_started
    );

CREATE TRIGGER book_state_counted_after_insert AFTER INSERT ON book_state BEGIN
    UPDATE series SET
        read_count = read_count + (new.is_read IS 1),
        started_count = started_count + new.is_started
    WHERE local_id = (SELECT series_local_id FROM book WHERE id = new.book_id);
END;

CREATE TRIGGER book_state_counted_again_after_update AFTER UPDATE ON book_state
WHEN (old.is_read IS 1) IS NOT (new.is_read IS 1) OR old.is_started IS NOT new.is_started
    OR old.book_id IS NOT new.book_id
BEGIN
    UPDATE series SET
        read_count = read_count - (old.is_read IS 1),
        started_count = started_count - old.is_started
    WHERE local_id = (SELECT series_local_id FROM book WHERE id = old.book_id);
    UPDATE series SET
        read_count = read_count + (new.is_read IS 1),
        started_count = started_count + new.is_started
    WHERE local_id = (SELECT series_local_id FROM book WHERE id = new.book_id);
END;

CREATE TRIGGER book_state_counted_out_after_delete AFTER DELETE ON book_state BEGIN
    UPDATE series SET
        read_count = read_count - (old.is_read IS 1),
        started_count = started_count - old.is_started
    WHERE local_id = (SELECT series_local_id FROM book WHERE id = old.book_id);
END;

CREATE TRIGGER book_reading_counted_after_insert AFTER INSERT ON book BEGIN
    UPDATE series SET
        read_count = read_count + (book_state.is_read IS 1),
        started_count = started_count + book_state.is_started
    FROM book_state
    WHERE book_state.book_id = new.id AND series.local_id = new.series_local_id;
END;

CREATE TRIGGER book_reading_counted_out_after_delete AFTER DELETE ON book BEGIN
    UPDATE series SET
        read_count = read_count - (book_state.is_read IS 1),
        started_count = started_count - book_state.is_started
    FROM book_state
    WHERE book_state.book_id = old.id AND series.local_id = old.series_local_id;
END;

CREATE TRIGGER book_reading_counted_again_after_move AFTER UPDATE OF series_local_id ON book BEGIN
    UPDATE series SET
        read_count = read_count - (book_state.is_read IS 1),
        started_count = started_count - book_state.is_started
    FROM book_state
    WHERE book_state.book_id = old.id AND series.local_id = old.series_local_id;
    UPDATE series SET
        read_count = read_count + (book_state.is_read IS 1),
        started_count = started_count + book_state.is_started
    FROM book_state
    WHERE book_state.book_id = new.id AND series.local_id = new.series_local_id;
END;
