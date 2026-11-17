CREATE TABLE series_emptied_place (
    series_local_id INTEGER PRIMARY KEY REFERENCES series (local_id) ON DELETE CASCADE,
    root_id INTEGER NOT NULL REFERENCES library_root (id) ON DELETE CASCADE,
    location BLOB NOT NULL
) STRICT;

CREATE INDEX series_emptied_place_by_root ON series_emptied_place (root_id);
