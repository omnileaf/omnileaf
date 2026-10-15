ALTER TABLE library_view
    ADD COLUMN fits_covers_to_width INTEGER NOT NULL DEFAULT 1 CHECK (fits_covers_to_width IN (0, 1));
