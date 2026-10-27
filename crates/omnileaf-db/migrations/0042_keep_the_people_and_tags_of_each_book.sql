CREATE TABLE book_person (
    book_id BLOB NOT NULL REFERENCES book_details (book_id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (
        role IN ('writer', 'penciller', 'inker', 'colourist', 'letterer', 'cover_artist', 'editor')
    ),
    name TEXT NOT NULL,
    PRIMARY KEY (book_id, role, name)
) STRICT, WITHOUT ROWID;

CREATE INDEX book_person_by_name ON book_person (name);

CREATE TABLE book_tag (
    book_id BLOB NOT NULL REFERENCES book_details (book_id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('genre', 'tag')),
    name TEXT NOT NULL,
    PRIMARY KEY (book_id, kind, name)
) STRICT, WITHOUT ROWID;

CREATE INDEX book_tag_by_name ON book_tag (name);

DELETE FROM book_details;
