CREATE TABLE library_view (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    display TEXT NOT NULL CHECK (display IN ('grid', 'compact', 'list')),
    phone_columns INTEGER NOT NULL CHECK (phone_columns BETWEEN 2 AND 5),
    tablet_columns INTEGER NOT NULL CHECK (tablet_columns BETWEEN 3 AND 8),
    desktop_columns INTEGER NOT NULL CHECK (desktop_columns BETWEEN 4 AND 12),
    shows_item_counts INTEGER NOT NULL CHECK (shows_item_counts IN (0, 1))
) STRICT;
