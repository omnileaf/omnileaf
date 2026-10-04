CREATE TABLE library_view (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    display TEXT NOT NULL CHECK (display IN ('grid', 'compact', 'list')),
    phone_covers_per_row INTEGER NOT NULL CHECK (phone_covers_per_row BETWEEN 2 AND 5),
    tablet_covers_per_row INTEGER NOT NULL CHECK (tablet_covers_per_row BETWEEN 3 AND 8),
    desktop_covers_per_row INTEGER NOT NULL CHECK (desktop_covers_per_row BETWEEN 4 AND 12),
    shows_item_counts INTEGER NOT NULL CHECK (shows_item_counts IN (0, 1)),
    shows_unread_count INTEGER NOT NULL CHECK (shows_unread_count IN (0, 1)),
    shows_downloaded INTEGER NOT NULL CHECK (shows_downloaded IN (0, 1)),
    shows_language INTEGER NOT NULL CHECK (shows_language IN (0, 1)),
    shows_reading_progress INTEGER NOT NULL CHECK (shows_reading_progress IN (0, 1)),
    shows_continue_button INTEGER NOT NULL CHECK (shows_continue_button IN (0, 1))
) STRICT;
