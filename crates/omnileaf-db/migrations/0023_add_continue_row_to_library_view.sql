ALTER TABLE library_view
    ADD COLUMN shows_continue_row INTEGER NOT NULL DEFAULT 0 CHECK (shows_continue_row IN (0, 1));
