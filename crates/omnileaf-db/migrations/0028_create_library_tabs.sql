CREATE TABLE library_tab (
    position INTEGER PRIMARY KEY CHECK (position >= 0),
    tab TEXT NOT NULL UNIQUE CHECK (tab IN ('all', 'new_chapters') OR tab GLOB 'category:?*'),
    is_hidden INTEGER NOT NULL CHECK (is_hidden IN (0, 1))
) STRICT;
