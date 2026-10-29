CREATE TABLE book_title_search (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    book_id BLOB NOT NULL CHECK (length(book_id) = 16),
    kind TEXT NOT NULL CHECK (kind IN ('file_name', 'comic_info')),
    title TEXT NOT NULL,
    UNIQUE (book_id, kind)
) STRICT;

CREATE VIRTUAL TABLE book_title_fts USING fts5 (
    title,
    content = 'book_title_search',
    content_rowid = 'id',
    tokenize = 'trigram'
);

INSERT INTO book_title_search (book_id, kind, title)
SELECT id, 'file_name', title FROM book;

INSERT INTO book_title_search (book_id, kind, title)
SELECT book_id, 'comic_info', trim(title) FROM book_details
WHERE nullif(trim(title), '') IS NOT NULL;

INSERT INTO book_title_fts (book_title_fts) VALUES ('rebuild');

CREATE TRIGGER book_title_searchable_after_insert AFTER INSERT ON book_title_search BEGIN
    INSERT INTO book_title_fts (rowid, title) VALUES (new.id, new.title);
END;

CREATE TRIGGER book_title_unsearchable_after_delete AFTER DELETE ON book_title_search BEGIN
    INSERT INTO book_title_fts (book_title_fts, rowid, title) VALUES ('delete', old.id, old.title);
END;

CREATE TRIGGER book_title_searchable_again_after_retitle
AFTER UPDATE OF title ON book_title_search
WHEN old.title IS NOT new.title
BEGIN
    INSERT INTO book_title_fts (book_title_fts, rowid, title) VALUES ('delete', old.id, old.title);
    INSERT INTO book_title_fts (rowid, title) VALUES (new.id, new.title);
END;

CREATE TRIGGER book_titled_after_insert AFTER INSERT ON book BEGIN
    INSERT INTO book_title_search (book_id, kind, title) VALUES (new.id, 'file_name', new.title);
END;

CREATE TRIGGER book_titled_again_after_rename
AFTER UPDATE OF title ON book
WHEN old.title IS NOT new.title
BEGIN
    UPDATE book_title_search SET title = new.title
    WHERE book_id = new.id AND kind = 'file_name';
END;

CREATE TRIGGER book_untitled_after_delete AFTER DELETE ON book BEGIN
    DELETE FROM book_title_search WHERE book_id = old.id;
END;

CREATE TRIGGER book_details_titled_after_insert AFTER INSERT ON book_details
WHEN nullif(trim(new.title), '') IS NOT NULL
BEGIN
    INSERT INTO book_title_search (book_id, kind, title)
    VALUES (new.book_id, 'comic_info', trim(new.title))
    ON CONFLICT (book_id, kind) DO UPDATE SET title = excluded.title;
END;

CREATE TRIGGER book_details_titled_again_after_update
AFTER UPDATE OF title ON book_details
WHEN old.title IS NOT new.title AND nullif(trim(new.title), '') IS NOT NULL
BEGIN
    INSERT INTO book_title_search (book_id, kind, title)
    VALUES (new.book_id, 'comic_info', trim(new.title))
    ON CONFLICT (book_id, kind) DO UPDATE SET title = excluded.title;
END;

CREATE TRIGGER book_details_untitled_after_update
AFTER UPDATE OF title ON book_details
WHEN old.title IS NOT new.title AND nullif(trim(new.title), '') IS NULL
BEGIN
    DELETE FROM book_title_search WHERE book_id = new.book_id AND kind = 'comic_info';
END;

CREATE TRIGGER book_details_untitled_after_delete AFTER DELETE ON book_details BEGIN
    DELETE FROM book_title_search WHERE book_id = old.book_id AND kind = 'comic_info';
END;
