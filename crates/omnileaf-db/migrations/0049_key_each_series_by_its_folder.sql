ALTER TABLE series ADD COLUMN year INTEGER CHECK (year BETWEEN 1000 AND 2999);

ALTER TABLE series ADD COLUMN year_source TEXT
    CHECK (year_source IN ('folder_name', 'file_name', 'files'))
    CHECK ((year_source IS NULL) = (year IS NULL));

ALTER TABLE series ADD COLUMN title_source TEXT
    CHECK (title_source IN ('folder_name', 'file_name', 'files'));

DELETE FROM book_person;
DELETE FROM book_tag;
DELETE FROM book_details;
