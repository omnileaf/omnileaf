CREATE TABLE search_name (
    id INTEGER PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('tag', 'person')),
    name TEXT NOT NULL,
    UNIQUE (kind, name)
) STRICT;

CREATE VIRTUAL TABLE search_name_fts USING fts5 (
    name,
    content = 'search_name',
    content_rowid = 'id',
    tokenize = 'trigram'
);

CREATE TRIGGER search_name_searchable_after_insert AFTER INSERT ON search_name BEGIN
    INSERT INTO search_name_fts (rowid, name) VALUES (new.id, new.name);
END;

CREATE TRIGGER search_name_unsearchable_after_delete AFTER DELETE ON search_name BEGIN
    INSERT INTO search_name_fts (search_name_fts, rowid, name) VALUES ('delete', old.id, old.name);
END;

INSERT INTO search_name (kind, name) SELECT DISTINCT 'tag', name FROM series_tag;

INSERT INTO search_name (kind, name) SELECT DISTINCT 'person', name FROM book_person;

CREATE TRIGGER series_tag_searchable_after_insert AFTER INSERT ON series_tag BEGIN
    INSERT OR IGNORE INTO search_name (kind, name) VALUES ('tag', new.name);
END;

CREATE TRIGGER series_tag_unsearchable_after_delete AFTER DELETE ON series_tag
WHEN NOT EXISTS (SELECT 1 FROM series_tag WHERE name = old.name)
BEGIN
    DELETE FROM search_name WHERE kind = 'tag' AND name = old.name;
END;

CREATE TRIGGER book_person_searchable_after_insert AFTER INSERT ON book_person BEGIN
    INSERT OR IGNORE INTO search_name (kind, name) VALUES ('person', new.name);
END;

CREATE TRIGGER book_person_unsearchable_after_delete AFTER DELETE ON book_person
WHEN NOT EXISTS (SELECT 1 FROM book_person WHERE name = old.name)
BEGIN
    DELETE FROM search_name WHERE kind = 'person' AND name = old.name;
END;
