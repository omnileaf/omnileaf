CREATE TABLE library_listing (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    sort_order TEXT NOT NULL CHECK (sort_order IN ('title', 'date_added')),
    sort_direction TEXT NOT NULL CHECK (sort_direction IN ('ascending', 'descending')),
    unread TEXT NOT NULL CHECK (unread IN ('any', 'only', 'hide')),
    started TEXT NOT NULL CHECK (started IN ('any', 'only', 'hide')),
    finished TEXT NOT NULL CHECK (finished IN ('any', 'only', 'hide'))
) STRICT;
