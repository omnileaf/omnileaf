CREATE INDEX reading_session_by_progress
    ON reading_session (started_at_ms, id, ended_at_ms, page, first_page)
    WHERE page > first_page;
