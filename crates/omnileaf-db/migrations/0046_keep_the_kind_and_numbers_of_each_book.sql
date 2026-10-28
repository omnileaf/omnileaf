ALTER TABLE book ADD COLUMN kind TEXT CHECK (kind IN ('volume', 'chapter', 'special'));

ALTER TABLE book ADD COLUMN first_number INTEGER
    CHECK (first_number >= 0)
    CHECK (first_number IS NULL OR kind IS NOT NULL)
    CHECK (first_number IS NOT NULL OR kind IS NOT 'volume');

ALTER TABLE book ADD COLUMN last_number INTEGER
    CHECK (last_number >= first_number)
    CHECK ((last_number IS NULL) = (first_number IS NULL));

ALTER TABLE book ADD COLUMN number_source TEXT
    CHECK (number_source IN ('folder_name', 'file_name', 'files'))
    CHECK ((number_source IS NULL) = (first_number IS NULL));

ALTER TABLE book ADD COLUMN volume_number INTEGER
    CHECK (volume_number >= 0)
    CHECK (volume_number IS NULL OR kind IS 'chapter');

ALTER TABLE book ADD COLUMN volume_source TEXT
    CHECK (volume_source IN ('folder_name', 'file_name', 'files'))
    CHECK ((volume_source IS NULL) = (volume_number IS NULL));
