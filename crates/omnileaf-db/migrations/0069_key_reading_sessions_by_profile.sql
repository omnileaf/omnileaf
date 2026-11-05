ALTER TABLE reading_session ADD COLUMN profile BLOB NOT NULL DEFAULT x'767c5c13abfd8f4a8c579d6a095c701d' CHECK (length(profile) = 16);

DROP INDEX reading_session_by_start;
DROP INDEX reading_session_by_book;
DROP INDEX reading_session_by_day;
DROP INDEX reading_session_by_progress;

CREATE INDEX reading_session_by_profile_id ON reading_session (profile, id);
CREATE INDEX reading_session_by_profile_start ON reading_session (profile, started_at_ms, id);
CREATE INDEX reading_session_by_profile_day
    ON reading_session (profile, local_day, started_at_ms, ended_at_ms);
CREATE INDEX reading_session_by_profile_book
    ON reading_session (profile, book_id, started_at_ms, ended_at_ms);
CREATE INDEX reading_session_by_profile_progress
    ON reading_session (profile, started_at_ms, id, ended_at_ms, page, first_page)
    WHERE page > first_page;
