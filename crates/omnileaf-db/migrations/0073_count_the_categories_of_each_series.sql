ALTER TABLE series ADD COLUMN kept_categories INTEGER NOT NULL DEFAULT 0 CHECK (kept_categories >= 0);

UPDATE series SET kept_categories = (
    SELECT count(*) FROM category_member
    JOIN category ON category.category_id = category_member.category_id
    WHERE category_member.series_local_id = series.local_id
);

CREATE TRIGGER category_member_counted_after_insert AFTER INSERT ON category_member
WHEN EXISTS (SELECT 1 FROM category WHERE category_id = new.category_id)
BEGIN
    UPDATE series SET kept_categories = kept_categories + 1
    WHERE local_id = new.series_local_id;
END;

CREATE TRIGGER category_member_counted_out_after_delete AFTER DELETE ON category_member
WHEN EXISTS (SELECT 1 FROM category WHERE category_id = old.category_id)
BEGIN
    UPDATE series SET kept_categories = kept_categories - 1
    WHERE local_id = old.series_local_id;
END;

CREATE TRIGGER category_counted_after_insert AFTER INSERT ON category
BEGIN
    UPDATE series SET kept_categories = kept_categories + 1
    WHERE local_id IN (
        SELECT series_local_id FROM category_member WHERE category_id = new.category_id
    );
END;

CREATE TRIGGER category_counted_out_after_delete AFTER DELETE ON category
BEGIN
    UPDATE series SET kept_categories = kept_categories - 1
    WHERE local_id IN (
        SELECT series_local_id FROM category_member WHERE category_id = old.category_id
    );
END;

CREATE INDEX series_in_no_category_by_stage ON series (reading_stage) WHERE kept_categories = 0;
