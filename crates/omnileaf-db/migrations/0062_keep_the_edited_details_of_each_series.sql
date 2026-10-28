CREATE TABLE series_edit (
    series_id BLOB NOT NULL PRIMARY KEY CHECK (length(series_id) = 16),
    title TEXT,
    title_key BLOB CHECK ((title IS NULL) = (title_key IS NULL)),
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

ALTER TABLE series ADD COLUMN file_title TEXT NOT NULL DEFAULT '';

ALTER TABLE series ADD COLUMN file_title_key BLOB NOT NULL DEFAULT x'';

UPDATE series SET file_title = title, file_title_key = title_key;

ALTER TABLE series ADD COLUMN marked_adult INTEGER NOT NULL DEFAULT 0
    CHECK (marked_adult IN (0, 1));

DROP INDEX series_by_stage_and_time_left;

CREATE INDEX series_by_stage_and_time_left
    ON series (
        reading_stage, time_left_key, id, last_read_at_ms, duplicated_books, language,
        adult_rated_books, manga_books, bookmarked_books, marked_adult
    )
    WHERE reading_stage IS NOT NULL;

CREATE TRIGGER series_edit_marks_series_after_insert AFTER INSERT ON series_edit BEGIN
    UPDATE series SET adult_rated_books = adult_rated_books + 1, marked_adult = 1
    WHERE new.is_adult = 1 AND id = new.series_id;
END;

CREATE TRIGGER series_edit_unmarks_series_after_delete AFTER DELETE ON series_edit BEGIN
    UPDATE series SET adult_rated_books = adult_rated_books - 1, marked_adult = 0
    WHERE old.is_adult = 1 AND id = old.series_id;
END;

CREATE TRIGGER series_edit_titles_series_after_insert AFTER INSERT ON series_edit
WHEN new.title IS NOT NULL
BEGIN
    UPDATE series SET title = new.title, title_key = new.title_key WHERE id = new.series_id;
END;

CREATE TRIGGER series_edit_untitles_series_after_delete AFTER DELETE ON series_edit
WHEN old.title IS NOT NULL
BEGIN
    UPDATE series SET title = file_title, title_key = file_title_key WHERE id = old.series_id;
END;

CREATE TRIGGER series_takes_its_edits_after_insert AFTER INSERT ON series BEGIN
    UPDATE series SET adult_rated_books = adult_rated_books + 1, marked_adult = 1
    WHERE local_id = new.local_id
        AND EXISTS (SELECT 1 FROM series_edit WHERE series_id = new.id AND is_adult = 1);
END;

DROP TRIGGER book_details_name_series_again_after_update;

CREATE TRIGGER book_details_name_series_again_after_update
AFTER UPDATE OF language, age_rating ON book_details BEGIN
    UPDATE series SET (language, language_source) = (
        SELECT language, language_source FROM series_language
        WHERE series_local_id = series.local_id
    )
    WHERE new.language IS NOT old.language
        AND local_id = (SELECT series_local_id FROM book WHERE id = new.book_id);
    UPDATE series SET adult_rated_books = (
        SELECT count(*) FROM adult_rated_book WHERE series_local_id = series.local_id
    ) + coalesce((SELECT is_adult FROM series_edit WHERE series_id = series.id), 0)
    WHERE new.age_rating IS NOT old.age_rating
        AND local_id = (SELECT series_local_id FROM book WHERE id = new.book_id);
END;

ALTER TABLE series ADD COLUMN edits_tags INTEGER NOT NULL DEFAULT 0 CHECK (edits_tags IN (0, 1));

DROP TRIGGER book_tag_counted_after_insert;
DROP TRIGGER book_tag_counted_out_after_delete;
DROP TRIGGER book_tags_counted_out_before_delete;
DROP TRIGGER book_tags_counted_again_after_move;

CREATE TRIGGER book_tag_counted_after_insert AFTER INSERT ON book_tag
WHEN NOT EXISTS (
    SELECT 1 FROM book_tag AS other
    WHERE other.book_id = new.book_id AND other.name = new.name AND other.kind IS NOT new.kind
)
BEGIN
    INSERT INTO series_tag (series_local_id, name, book_count)
    SELECT book.series_local_id, new.name, 1 FROM book
    WHERE book.id = new.book_id
        AND (SELECT edits_tags FROM series WHERE local_id = book.series_local_id) = 0
    ON CONFLICT (series_local_id, name) DO UPDATE SET book_count = book_count + 1;
END;

CREATE TRIGGER book_tag_counted_out_after_delete AFTER DELETE ON book_tag
WHEN NOT EXISTS (
    SELECT 1 FROM book_tag AS other WHERE other.book_id = old.book_id AND other.name = old.name
)
BEGIN
    DELETE FROM series_tag
    WHERE book_count = 1 AND name = old.name
        AND series_local_id = (SELECT series_local_id FROM book WHERE id = old.book_id)
        AND (SELECT edits_tags FROM series WHERE local_id = series_tag.series_local_id) = 0;
    UPDATE series_tag SET book_count = book_count - 1
    WHERE book_count > 1 AND name = old.name
        AND series_local_id = (SELECT series_local_id FROM book WHERE id = old.book_id)
        AND (SELECT edits_tags FROM series WHERE local_id = series_tag.series_local_id) = 0;
END;

CREATE TRIGGER book_tags_counted_out_before_delete BEFORE DELETE ON book
WHEN (SELECT edits_tags FROM series WHERE local_id = old.series_local_id) = 0
BEGIN
    DELETE FROM series_tag
    WHERE series_local_id = old.series_local_id AND book_count = 1
        AND name IN (SELECT name FROM book_tag WHERE book_id = old.id);
    UPDATE series_tag SET book_count = book_count - 1
    WHERE series_local_id = old.series_local_id AND book_count > 1
        AND name IN (SELECT name FROM book_tag WHERE book_id = old.id);
END;

CREATE TRIGGER book_tags_counted_again_after_move AFTER UPDATE OF series_local_id ON book BEGIN
    DELETE FROM series_tag
    WHERE series_local_id = old.series_local_id AND book_count = 1
        AND name IN (SELECT name FROM book_tag WHERE book_id = old.id)
        AND (SELECT edits_tags FROM series WHERE local_id = old.series_local_id) = 0;
    UPDATE series_tag SET book_count = book_count - 1
    WHERE series_local_id = old.series_local_id AND book_count > 1
        AND name IN (SELECT name FROM book_tag WHERE book_id = old.id)
        AND (SELECT edits_tags FROM series WHERE local_id = old.series_local_id) = 0;
    INSERT INTO series_tag (series_local_id, name, book_count)
    SELECT DISTINCT new.series_local_id, name, 1 FROM book_tag
    WHERE book_id = new.id
        AND (SELECT edits_tags FROM series WHERE local_id = new.series_local_id) = 0
    ON CONFLICT (series_local_id, name) DO UPDATE SET book_count = book_count + 1;
END;

CREATE TRIGGER series_edit_tags_series_after_insert AFTER INSERT ON series_edit
WHEN new.has_tags = 1
BEGIN
    UPDATE series SET edits_tags = 1 WHERE id = new.series_id;
    DELETE FROM series_tag
    WHERE series_local_id = (SELECT local_id FROM series WHERE id = new.series_id);
    INSERT OR IGNORE INTO series_tag (series_local_id, name, book_count)
    SELECT series.local_id, series_edit_tag.name, 1 FROM series_edit_tag
    JOIN series ON series.id = series_edit_tag.series_id
    WHERE series_edit_tag.series_id = new.series_id;
END;

CREATE TRIGGER series_edit_untags_series_after_delete AFTER DELETE ON series_edit
WHEN old.has_tags = 1
BEGIN
    UPDATE series SET edits_tags = 0 WHERE id = old.series_id;
    DELETE FROM series_tag
    WHERE series_local_id = (SELECT local_id FROM series WHERE id = old.series_id);
    INSERT INTO series_tag (series_local_id, name, book_count)
    SELECT book.series_local_id, book_tag.name, count(DISTINCT book.id)
    FROM book_tag JOIN book ON book.id = book_tag.book_id
    WHERE book.series_local_id = (SELECT local_id FROM series WHERE id = old.series_id)
    GROUP BY book.series_local_id, book_tag.name;
END;

CREATE TRIGGER series_takes_its_edited_tags_after_insert AFTER INSERT ON series
WHEN EXISTS (SELECT 1 FROM series_edit WHERE series_id = new.id AND has_tags = 1)
BEGIN
    UPDATE series SET edits_tags = 1 WHERE local_id = new.local_id;
    INSERT OR IGNORE INTO series_tag (series_local_id, name, book_count)
    SELECT new.local_id, name, 1 FROM series_edit_tag WHERE series_id = new.id;
END;
