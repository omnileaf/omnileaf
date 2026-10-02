CREATE TABLE book_state (
    book_id BLOB PRIMARY KEY CHECK (length(book_id) = 16),
    position_page INTEGER CHECK (position_page >= 0),
    furthest_page INTEGER CHECK (furthest_page >= 0),
    is_read INTEGER CHECK (is_read IN (0, 1))
) STRICT, WITHOUT ROWID;
