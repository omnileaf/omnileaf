ALTER TABLE series RENAME COLUMN title_sort_key TO title_key;

CREATE TABLE title_key_stamp (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    locale TEXT NOT NULL,
    stamp BLOB NOT NULL CHECK (length(stamp) = 16)
) STRICT;

INSERT INTO title_key_stamp (id, locale, stamp) VALUES (1, 'und', zeroblob(16));
