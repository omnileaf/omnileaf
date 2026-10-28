ALTER TABLE book_person ADD COLUMN name_key BLOB NOT NULL DEFAULT x'';

CREATE INDEX book_person_by_writer ON book_person (name_key, name) WHERE role = 'writer';

UPDATE title_key_stamp SET stamp = zeroblob(16);
