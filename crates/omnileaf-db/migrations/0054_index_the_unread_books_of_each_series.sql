ALTER TABLE book ADD COLUMN is_marked_read INTEGER NOT NULL DEFAULT 0
    CHECK (is_marked_read IN (0, 1));

UPDATE book SET is_marked_read = 1
WHERE id IN (SELECT book_id FROM book_state WHERE is_read IS 1);

CREATE INDEX book_unread_by_series ON book (series_local_id, reading_order_key, id)
    WHERE is_marked_read = 0;

CREATE TRIGGER book_marked_read_after_state_insert AFTER INSERT ON book_state
WHEN new.is_read IS 1
BEGIN
    UPDATE book SET is_marked_read = 1 WHERE id = new.book_id;
END;

CREATE TRIGGER book_marked_again_after_state_update AFTER UPDATE ON book_state
WHEN (old.is_read IS 1) IS NOT (new.is_read IS 1) OR old.book_id IS NOT new.book_id
BEGIN
    UPDATE book SET is_marked_read = 0 WHERE id = old.book_id;
    UPDATE book SET is_marked_read = (new.is_read IS 1) WHERE id = new.book_id;
END;

CREATE TRIGGER book_marked_unread_after_state_delete AFTER DELETE ON book_state
WHEN old.is_read IS 1
BEGIN
    UPDATE book SET is_marked_read = 0 WHERE id = old.book_id;
END;

CREATE TRIGGER book_marked_read_after_insert AFTER INSERT ON book
WHEN EXISTS (SELECT 1 FROM book_state WHERE book_id = new.id AND is_read IS 1)
BEGIN
    UPDATE book SET is_marked_read = 1 WHERE id = new.id;
END;
