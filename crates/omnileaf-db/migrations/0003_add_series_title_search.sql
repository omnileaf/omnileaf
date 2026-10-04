CREATE VIRTUAL TABLE series_fts USING fts5 (
    title,
    content = 'series',
    content_rowid = 'local_id',
    tokenize = 'trigram'
);

INSERT INTO series_fts (series_fts) VALUES ('rebuild');

CREATE TRIGGER series_searchable_after_insert AFTER INSERT ON series BEGIN
    INSERT INTO series_fts (rowid, title) VALUES (new.local_id, new.title);
END;

CREATE TRIGGER series_unsearchable_after_delete AFTER DELETE ON series BEGIN
    INSERT INTO series_fts (series_fts, rowid, title) VALUES ('delete', old.local_id, old.title);
END;

CREATE TRIGGER series_searchable_again_after_rename AFTER UPDATE OF title ON series BEGIN
    INSERT INTO series_fts (series_fts, rowid, title) VALUES ('delete', old.local_id, old.title);
    INSERT INTO series_fts (rowid, title) VALUES (new.local_id, new.title);
END;
