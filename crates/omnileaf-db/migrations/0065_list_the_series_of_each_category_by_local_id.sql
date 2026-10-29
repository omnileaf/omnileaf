CREATE TABLE category_member (
    category_id BLOB NOT NULL CHECK (length(category_id) = 16),
    series_local_id INTEGER NOT NULL,
    PRIMARY KEY (category_id, series_local_id)
) STRICT, WITHOUT ROWID;

INSERT INTO category_member (category_id, series_local_id)
SELECT series_category.category_id, series.local_id
FROM series_category JOIN series ON series.id = series_category.series_id;

CREATE TRIGGER category_member_after_membership_insert AFTER INSERT ON series_category BEGIN
    INSERT OR IGNORE INTO category_member (category_id, series_local_id)
    SELECT new.category_id, local_id FROM series WHERE id = new.series_id;
END;

CREATE TRIGGER category_member_after_membership_delete AFTER DELETE ON series_category BEGIN
    DELETE FROM category_member
    WHERE category_id = old.category_id
        AND series_local_id = (SELECT local_id FROM series WHERE id = old.series_id);
END;

CREATE TRIGGER category_member_after_series_insert AFTER INSERT ON series BEGIN
    INSERT OR IGNORE INTO category_member (category_id, series_local_id)
    SELECT category_id, new.local_id FROM series_category WHERE series_id = new.id;
END;

CREATE TRIGGER category_member_after_series_delete AFTER DELETE ON series BEGIN
    DELETE FROM category_member
    WHERE series_local_id = old.local_id
        AND category_id IN (SELECT category_id FROM series_category WHERE series_id = old.id);
END;

CREATE TRIGGER category_member_after_series_rekey AFTER UPDATE OF id ON series
WHEN old.id != new.id
BEGIN
    DELETE FROM category_member
    WHERE series_local_id = old.local_id
        AND category_id IN (SELECT category_id FROM series_category WHERE series_id = old.id);
    INSERT OR IGNORE INTO category_member (category_id, series_local_id)
    SELECT category_id, new.local_id FROM series_category WHERE series_id = new.id;
END;
