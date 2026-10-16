ALTER TABLE reading_session ADD COLUMN first_page INTEGER CHECK (first_page >= 0);
