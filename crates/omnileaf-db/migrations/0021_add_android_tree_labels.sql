ALTER TABLE library_root ADD COLUMN tree_name TEXT CHECK ((tree_name IS NOT NULL) = (locator_kind = 'android_tree'));
ALTER TABLE library_root ADD COLUMN tree_place TEXT CHECK ((tree_place IS NOT NULL) = (locator_kind = 'android_tree'));
