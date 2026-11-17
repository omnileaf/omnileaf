CREATE TABLE series_emptied_place (
    series_local_id INTEGER PRIMARY KEY REFERENCES series (local_id) ON DELETE CASCADE,
    root_id INTEGER NOT NULL REFERENCES library_root (id) ON DELETE CASCADE,
    location BLOB NOT NULL
) STRICT;

CREATE INDEX series_emptied_place_by_root ON series_emptied_place (root_id);

CREATE TRIGGER book_file_refills_emptied_series_after_insert AFTER INSERT ON book_file BEGIN
    DELETE FROM series_emptied_place
    WHERE series_local_id = (SELECT series_local_id FROM book WHERE id = new.book_id);
END;

CREATE TRIGGER book_file_refills_emptied_series_after_move AFTER UPDATE OF book_id ON book_file
WHEN old.book_id != new.book_id
BEGIN
    DELETE FROM series_emptied_place
    WHERE series_local_id = (SELECT series_local_id FROM book WHERE id = new.book_id);
END;

CREATE TRIGGER book_refills_emptied_series_after_move AFTER UPDATE OF series_local_id ON book
WHEN old.series_local_id != new.series_local_id
    AND EXISTS (SELECT 1 FROM book_file WHERE book_id = new.id)
BEGIN
    DELETE FROM series_emptied_place WHERE series_local_id = new.series_local_id;
END;
