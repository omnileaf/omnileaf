CREATE TABLE book_bookmark (
    book_id BLOB NOT NULL CHECK (length(book_id) = 16),
    page INTEGER NOT NULL CHECK (page >= 0),
    PRIMARY KEY (book_id, page)
) STRICT, WITHOUT ROWID;
