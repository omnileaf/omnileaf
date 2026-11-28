ALTER TABLE library_view
    ADD COLUMN shows_volume_and_chapter_counts INTEGER NOT NULL DEFAULT 0 CHECK (shows_volume_and_chapter_counts IN (0, 1));
