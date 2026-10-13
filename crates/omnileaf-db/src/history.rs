use std::{collections::BTreeMap, ops::RangeInclusive};

use omnileaf_sync_proto::{BookId, SeriesId};
use rusqlite::{Connection, Row, Statement, ToSql, named_params};

use crate::{
    Error,
    catalog::{
        BookReading, Cover, Page, PageRequest, cover::stored_cover, cursor::Position,
        series_books::stored_reading, stored_id::stored_id,
    },
};

macro_rules! sessions_newest_first {
    ($($condition:literal)?) => {
        concat!(
            "SELECT reading_session.id AS session_id, reading_session.book_id,
                reading_session.started_at_ms, reading_session.ended_at_ms,
                reading_session.utc_offset_minutes, reading_session.local_day,
                reading_session.page, reading_session.page_count,
                book.title AS book_title, series.id AS series_id, series.title AS series_title,
                (SELECT count(*) FROM book AS earlier
                    WHERE earlier.series_local_id = book.series_local_id
                        AND (earlier.title_sort_key, earlier.id) < (book.title_sort_key, book.id))
                    + 1 AS position,
                cover.book_id AS cover_book, cover.id AS cover_file, cover.rev AS cover_rev,
                book_state.is_read, book_state.is_started, book_state.position_page
            FROM reading_session
            CROSS JOIN book ON book.id = reading_session.book_id
            JOIN series ON series.local_id = book.series_local_id
            LEFT JOIN book_file AS cover
                ON cover.id = (SELECT min(id) FROM book_file WHERE book_file.book_id = book.id)
            LEFT JOIN book_state ON book_state.book_id = book.id ",
            $($condition,)?
            " ORDER BY reading_session.started_at_ms DESC, reading_session.id DESC LIMIT :limit"
        )
    };
}

const FIRST_SESSIONS: &str = sessions_newest_first!();
const SESSIONS_BEFORE: &str = sessions_newest_first!(
    "WHERE (reading_session.started_at_ms, reading_session.id) < (:after_started_at_ms, :after_id)"
);
const READING_TIME_BY_DAY: &str = "SELECT local_day, sum(ended_at_ms - started_at_ms) AS read_ms
    FROM reading_session
    WHERE local_day BETWEEN ?1 AND ?2
    GROUP BY local_day";
const READING_SINCE: &str = "SELECT coalesce(sum(ended_at_ms - started_at_ms), 0) AS read_ms,
        count(DISTINCT book_id) AS books_opened,
        count(DISTINCT CASE WHEN page + 1 >= page_count THEN book_id END) AS books_finished
    FROM reading_session
    WHERE local_day >= ?1";
const DAYS_READ_UP_TO: &str = "SELECT DISTINCT local_day
    FROM reading_session
    WHERE local_day <= ?1
    ORDER BY local_day DESC";
const BOOK_READING_TIME: &str = "SELECT coalesce(sum(ended_at_ms - started_at_ms), 0)
    FROM reading_session
    WHERE book_id = ?1";

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct HistoryEntry {
    pub book: BookId,
    pub book_title: String,
    pub series: SeriesId,
    pub series_title: String,
    /// Counting from 1 in the series' order.
    pub position: u32,
    /// The book's own cover, absent while it has no file.
    pub cover: Option<Cover>,
    pub started_at_ms: i64,
    pub ended_at_ms: i64,
    pub utc_offset_minutes: i16,
    /// Days since 1970-01-01 in the local time the session started at.
    pub local_day: i64,
    /// The page the session ended on, counting from 0.
    pub page: u32,
    pub page_count: u32,
    pub reading: BookReading,
}

/// Lists the sessions of books still in the library, the latest started first.
#[tracing::instrument(skip_all, fields(size = ?request.size))]
pub fn history_page(
    connection: &Connection,
    request: &PageRequest,
) -> Result<Page<HistoryEntry>, Error> {
    let limit = request.size.rows_to_fetch();
    let rows = match request.after.as_ref().map(|cursor| &cursor.0) {
        None => read(
            connection.prepare(FIRST_SESSIONS)?,
            named_params! { ":limit": limit },
        ),
        Some(Position::Session { started_at_ms, id }) => read(
            connection.prepare(SESSIONS_BEFORE)?,
            named_params! {
                ":after_started_at_ms": started_at_ms,
                ":after_id": id,
                ":limit": limit,
            },
        ),
        Some(
            Position::Title { .. }
            | Position::Added { .. }
            | Position::Book { .. }
            | Position::Root { .. },
        ) => Err(Error::CursorForAnotherList),
    }?;
    Ok(Page::of(rows, request.size))
}

/// Milliseconds read on each local day in `days` that has any reading, whether or not its books are still in the library.
pub fn reading_time_by_day(
    connection: &Connection,
    days: RangeInclusive<i64>,
) -> Result<BTreeMap<i64, i64>, Error> {
    let mut statement = connection.prepare(READING_TIME_BY_DAY)?;
    let rows = statement.query_map((days.start(), days.end()), |row| {
        Ok((row.get("local_day")?, row.get("read_ms")?))
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// What was read from the start of a local day on, whether or not its books are still in the library.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct ReadingSince {
    pub read_ms: i64,
    pub books_opened: u32,
    /// Books a session reached the last page of.
    pub books_finished: u32,
}

pub fn reading_since(connection: &Connection, first_day: i64) -> Result<ReadingSince, Error> {
    Ok(connection
        .prepare(READING_SINCE)?
        .query_row([first_day], |row| {
            Ok(ReadingSince {
                read_ms: row.get("read_ms")?,
                books_opened: row.get("books_opened")?,
                books_finished: row.get("books_finished")?,
            })
        })?)
}

/// Local days read on in a row up to `today`, or up to yesterday while today has no reading yet.
pub fn days_in_a_row(connection: &Connection, today: i64) -> Result<u32, Error> {
    let mut statement = connection.prepare(DAYS_READ_UP_TO)?;
    let days = statement.query_map([today], |row| row.get::<_, i64>("local_day"))?;
    let mut streak = 0;
    let mut next_day = today;
    for day in days {
        let day = day?;
        let carries_on = day == next_day || (streak == 0 && day == today - 1);
        if !carries_on {
            break;
        }
        streak += 1;
        next_day = day - 1;
    }
    Ok(streak)
}

/// Milliseconds spent reading `book` over all its sessions.
pub fn book_reading_time(connection: &Connection, book: BookId) -> Result<i64, Error> {
    Ok(connection
        .prepare(BOOK_READING_TIME)?
        .query_row([book.as_bytes()], |row| row.get(0))?)
}

fn read(
    mut statement: Statement<'_>,
    params: &[(&str, &dyn ToSql)],
) -> Result<Vec<(HistoryEntry, Position)>, Error> {
    let rows = statement.query_map(params, |row| {
        let entry = stored_entry(row)?;
        let position = Position::Session {
            started_at_ms: entry.started_at_ms,
            id: row.get("session_id")?,
        };
        Ok((entry, position))
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

fn stored_entry(row: &Row<'_>) -> rusqlite::Result<HistoryEntry> {
    Ok(HistoryEntry {
        book: stored_id(row, "book_id")?,
        book_title: row.get("book_title")?,
        series: stored_id(row, "series_id")?,
        series_title: row.get("series_title")?,
        position: row.get("position")?,
        cover: stored_cover(row)?,
        started_at_ms: row.get("started_at_ms")?,
        ended_at_ms: row.get("ended_at_ms")?,
        utc_offset_minutes: row.get("utc_offset_minutes")?,
        local_day: row.get("local_day")?,
        page: row.get("page")?,
        page_count: row.get("page_count")?,
        reading: stored_reading(row)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scratch::ScratchLibrary;

    fn sessions_plan(walk: &str) -> Vec<String> {
        [
            walk,
            "SEARCH book USING PRIMARY KEY (id=?)",
            "SEARCH series USING INTEGER PRIMARY KEY (rowid=?)",
            "SEARCH cover USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN",
            "CORRELATED SCALAR SUBQUERY 2",
            "SEARCH book_file USING COVERING INDEX book_file_by_book (book_id=?)",
            "SEARCH book_state USING PRIMARY KEY (book_id=?) LEFT-JOIN",
            "CORRELATED SCALAR SUBQUERY 1",
            "SEARCH earlier USING COVERING INDEX book_by_series (series_local_id=? AND (title_sort_key,id)<(?,?))",
        ]
        .map(str::to_owned)
        .to_vec()
    }

    #[test]
    fn starts_history_at_the_end_of_the_start_index_without_sorting() {
        let scratch = ScratchLibrary::new("first-sessions-plan");

        let plan = scratch.query_plan(FIRST_SESSIONS);

        assert_eq!(
            plan,
            sessions_plan("SCAN reading_session USING INDEX reading_session_by_start")
        );
    }

    #[test]
    fn walks_history_back_through_the_start_index_without_sorting() {
        let scratch = ScratchLibrary::new("sessions-before-plan");

        let plan = scratch.query_plan(SESSIONS_BEFORE);

        assert_eq!(
            plan,
            sessions_plan(
                "SEARCH reading_session USING INDEX reading_session_by_start (started_at_ms<?)"
            )
        );
    }

    #[test]
    fn adds_up_reading_by_day_from_the_day_index_alone() {
        let scratch = ScratchLibrary::new("reading-by-day-plan");

        let plan = scratch.query_plan(READING_TIME_BY_DAY);

        assert_eq!(
            plan,
            [
                "SEARCH reading_session USING INDEX reading_session_by_day (local_day>? AND local_day<?)"
            ]
        );
    }

    #[test]
    fn reads_the_days_since_from_the_day_index_counting_each_book_once() {
        let scratch = ScratchLibrary::new("reading-since-plan");

        let plan = scratch.query_plan(READING_SINCE);

        assert_eq!(
            plan,
            [
                "USE TEMP B-TREE FOR count(DISTINCT)",
                "USE TEMP B-TREE FOR count(DISTINCT)",
                "SEARCH reading_session USING INDEX reading_session_by_day (local_day>?)",
            ]
        );
    }

    #[test]
    fn walks_back_through_the_days_read_on_from_the_day_index_without_sorting() {
        let scratch = ScratchLibrary::new("days-read-plan");

        let plan = scratch.query_plan(DAYS_READ_UP_TO);

        assert_eq!(
            plan,
            ["SEARCH reading_session USING INDEX reading_session_by_day (local_day<?)"]
        );
    }

    #[test]
    fn adds_up_a_book_s_reading_from_the_book_index_alone() {
        let scratch = ScratchLibrary::new("book-reading-time-plan");

        let plan = scratch.query_plan(BOOK_READING_TIME);

        assert_eq!(
            plan,
            ["SEARCH reading_session USING COVERING INDEX reading_session_by_book (book_id=?)"]
        );
    }
}
