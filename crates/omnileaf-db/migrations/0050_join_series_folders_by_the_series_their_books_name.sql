CREATE TABLE series_folder (
    root_id INTEGER NOT NULL REFERENCES library_root (id) ON DELETE CASCADE,
    location BLOB NOT NULL,
    series_local_id INTEGER NOT NULL REFERENCES series (local_id),
    group_location BLOB NOT NULL,
    PRIMARY KEY (root_id, location)
) STRICT;

CREATE INDEX series_folder_by_series ON series_folder (series_local_id);

DELETE FROM book_person;
DELETE FROM book_tag;
DELETE FROM book_details;
