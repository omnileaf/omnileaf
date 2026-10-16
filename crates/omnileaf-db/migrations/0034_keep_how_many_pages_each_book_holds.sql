ALTER TABLE book ADD COLUMN page_count INTEGER CHECK (page_count >= 0);

UPDATE book SET page_count = (
    SELECT length(book_pages.manifest) / 8 FROM book_file
    JOIN book_pages ON book_pages.file_id = book_file.id AND book_pages.rev = book_file.rev
    WHERE book_file.book_id = book.id
    ORDER BY book_file.id
    LIMIT 1
);
