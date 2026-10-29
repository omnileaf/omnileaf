CREATE TABLE book_removed (
    book_id BLOB NOT NULL PRIMARY KEY CHECK (length(book_id) = 16)
) STRICT, WITHOUT ROWID;
