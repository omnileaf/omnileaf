CREATE INDEX category_member_by_series ON category_member (series_local_id, category_id);

CREATE TABLE series_kept_categories (
    series_local_id INTEGER PRIMARY KEY,
    kept INTEGER NOT NULL CHECK (kept >= 0)
) STRICT;

INSERT INTO series_kept_categories (series_local_id, kept)
SELECT series.local_id, (
    SELECT count(*) FROM category_member
    JOIN category ON category.category_id = category_member.category_id
    WHERE category_member.series_local_id = series.local_id
) FROM series;

CREATE INDEX series_in_no_category ON series_kept_categories (series_local_id) WHERE kept = 0;

CREATE INDEX series_in_a_category ON series_kept_categories (series_local_id) WHERE kept > 0;

CREATE TRIGGER series_kept_categories_after_series_insert AFTER INSERT ON series
BEGIN
    INSERT OR REPLACE INTO series_kept_categories (series_local_id, kept)
    VALUES (new.local_id, (
        SELECT count(*) FROM category_member
        JOIN category ON category.category_id = category_member.category_id
        WHERE category_member.series_local_id = new.local_id
    ));
END;

CREATE TRIGGER series_kept_categories_after_series_delete AFTER DELETE ON series
BEGIN
    DELETE FROM series_kept_categories WHERE series_local_id = old.local_id;
END;

CREATE TRIGGER series_kept_categories_after_member_insert AFTER INSERT ON category_member
BEGIN
    UPDATE series_kept_categories SET kept = (
        SELECT count(*) FROM category_member
        JOIN category ON category.category_id = category_member.category_id
        WHERE category_member.series_local_id = new.series_local_id
    ) WHERE series_local_id = new.series_local_id;
END;

CREATE TRIGGER series_kept_categories_after_member_delete AFTER DELETE ON category_member
BEGIN
    UPDATE series_kept_categories SET kept = (
        SELECT count(*) FROM category_member
        JOIN category ON category.category_id = category_member.category_id
        WHERE category_member.series_local_id = old.series_local_id
    ) WHERE series_local_id = old.series_local_id;
END;

CREATE TRIGGER series_kept_categories_after_category_insert AFTER INSERT ON category
BEGIN
    UPDATE series_kept_categories SET kept = kept + 1
    WHERE series_local_id IN (
        SELECT series_local_id FROM category_member WHERE category_id = new.category_id
    );
END;

CREATE TRIGGER series_kept_categories_after_category_delete AFTER DELETE ON category
BEGIN
    UPDATE series_kept_categories SET kept = kept - 1
    WHERE series_local_id IN (
        SELECT series_local_id FROM category_member WHERE category_id = old.category_id
    );
END;
