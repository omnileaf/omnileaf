CREATE TABLE series_edit (
    series_id BLOB NOT NULL PRIMARY KEY CHECK (length(series_id) = 16),
    title TEXT,
    summary TEXT,
    is_adult INTEGER NOT NULL DEFAULT 0 CHECK (is_adult IN (0, 1)),
    has_people INTEGER NOT NULL DEFAULT 0 CHECK (has_people IN (0, 1)),
    has_tags INTEGER NOT NULL DEFAULT 0 CHECK (has_tags IN (0, 1))
) STRICT, WITHOUT ROWID;

CREATE TABLE series_edit_person (
    series_id BLOB NOT NULL CHECK (length(series_id) = 16),
    position INTEGER NOT NULL CHECK (position >= 0),
    role TEXT NOT NULL CHECK (
        role IN (
            '', 'writer', 'penciller', 'inker', 'colourist', 'letterer', 'cover_artist', 'editor'
        )
    ),
    name TEXT NOT NULL,
    name_key BLOB NOT NULL,
    PRIMARY KEY (series_id, position)
) STRICT, WITHOUT ROWID;

CREATE TABLE series_edit_tag (
    series_id BLOB NOT NULL CHECK (length(series_id) = 16),
    position INTEGER NOT NULL CHECK (position >= 0),
    name TEXT NOT NULL,
    PRIMARY KEY (series_id, position)
) STRICT, WITHOUT ROWID;
