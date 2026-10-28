ALTER TABLE library_view
    ADD COLUMN stacks_series_covers INTEGER NOT NULL DEFAULT 1 CHECK (stacks_series_covers IN (0, 1));
