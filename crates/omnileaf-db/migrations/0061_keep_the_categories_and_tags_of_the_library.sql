CREATE TABLE category (
    category_id BLOB NOT NULL PRIMARY KEY CHECK (length(category_id) = 16),
    name TEXT NOT NULL,
    position INTEGER NOT NULL CHECK (position >= 0)
) STRICT, WITHOUT ROWID;

CREATE TABLE label_tag (
    tag_id BLOB NOT NULL PRIMARY KEY CHECK (length(tag_id) = 16),
    name TEXT NOT NULL,
    norm_name TEXT NOT NULL
) STRICT, WITHOUT ROWID;

CREATE INDEX label_tag_by_norm_name ON label_tag (norm_name, tag_id);

CREATE TABLE series_category (
    series_id BLOB NOT NULL CHECK (length(series_id) = 16),
    category_id BLOB NOT NULL CHECK (length(category_id) = 16),
    PRIMARY KEY (series_id, category_id)
) STRICT, WITHOUT ROWID;

CREATE INDEX series_category_by_category ON series_category (category_id, series_id);

CREATE TABLE series_label_tag (
    series_id BLOB NOT NULL CHECK (length(series_id) = 16),
    tag_id BLOB NOT NULL CHECK (length(tag_id) = 16),
    PRIMARY KEY (series_id, tag_id)
) STRICT, WITHOUT ROWID;

CREATE INDEX series_label_tag_by_tag ON series_label_tag (tag_id, series_id);
