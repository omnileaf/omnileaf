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
