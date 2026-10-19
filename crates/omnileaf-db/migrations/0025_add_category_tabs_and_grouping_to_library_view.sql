ALTER TABLE library_view
    ADD COLUMN shows_category_tabs INTEGER NOT NULL DEFAULT 1 CHECK (shows_category_tabs IN (0, 1));
ALTER TABLE library_view
    ADD COLUMN group_by TEXT NOT NULL DEFAULT 'none' CHECK (group_by IN ('none', 'category', 'folder'));
