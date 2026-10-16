CREATE TABLE library_root_share (
    root_id INTEGER PRIMARY KEY REFERENCES library_root (id) ON DELETE CASCADE,
    address TEXT NOT NULL CHECK (address != '')
) STRICT;
