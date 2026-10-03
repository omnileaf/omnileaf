CREATE TABLE library_root_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL CHECK (kind IN ('home', 'linked')),
    locator_kind TEXT NOT NULL CHECK (locator_kind IN ('path', 'android_tree', 'apple_bookmark')),
    location BLOB NOT NULL UNIQUE,
    bookmark BLOB CHECK ((bookmark IS NOT NULL) = (locator_kind = 'apple_bookmark')),
    added_at_ms INTEGER NOT NULL
) STRICT;

INSERT INTO library_root_new (id, kind, locator_kind, location, bookmark, added_at_ms)
    SELECT id, kind, locator_kind, location, bookmark, added_at_ms FROM library_root;

DROP TABLE library_root;

ALTER TABLE library_root_new RENAME TO library_root;
