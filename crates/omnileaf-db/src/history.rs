use std::{collections::BTreeMap, ops::RangeInclusive};

use omnileaf_sync_proto::{BookId, SeriesId};
use rusqlite::{Connection, OptionalExtension, Row, Statement, ToSql, Transaction};

use crate::{
    Error,
    catalog::{
        BookReading, Cover, Page, PageRequest, cover::stored_cover, cursor::Position,
        series_books::stored_reading, stored_id::stored_id,
    },
    letter_case::fold_case,
};

macro_rules! sessions_newest_first {
    ($from:literal, $condition:literal) => {
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
                book_state.is_read, book_state.is_started, book_state.position_page ",
            $from,
            " LEFT JOIN book_file AS cover
                ON cover.id = (SELECT min(id) FROM book_file WHERE book_file.book_id = book.id)
            LEFT JOIN book_state ON book_state.book_id = book.id ",
            $condition,
            " ORDER BY reading_session.started_at_ms DESC, reading_session.id DESC LIMIT :limit"
        )
    };
}

macro_rules! from_sessions {
    ($condition:literal) => {
        sessions_newest_first!(
            "FROM reading_session
            CROSS JOIN book ON book.id = reading_session.book_id
            JOIN series ON series.local_id = book.series_local_id",
            $condition
        )
    };
}

macro_rules! from_series {
    ($condition:literal) => {
        sessions_newest_first!(
            "FROM series
            CROSS JOIN book ON book.series_local_id = series.local_id
            CROSS JOIN reading_session ON reading_session.book_id = book.id",
            $condition
        )
    };
}

const FIRST_SESSIONS: &str = from_sessions!("");
const SESSIONS_BEFORE: &str = from_sessions!(
    "WHERE (reading_session.started_at_ms, reading_session.id) < (:after_started_at_ms, :after_id)"
);
const FIRST_SESSIONS_OF_SERIES: &str = from_series!("WHERE series.id = :series");
const SESSIONS_OF_SERIES_BEFORE: &str = from_series!(
    "WHERE series.id = :series
        AND (reading_session.started_at_ms, reading_session.id) < (:after_started_at_ms, :after_id)"
);
const FIRST_SESSIONS_OF_BOOK: &str = from_sessions!("WHERE reading_session.book_id = :book");
const SESSIONS_OF_BOOK_BEFORE: &str = from_sessions!(
    "WHERE reading_session.book_id = :book
        AND (reading_session.started_at_ms, reading_session.id) < (:after_started_at_ms, :after_id)"
);
const FIRST_UNFINISHED: &str = from_sessions!(
    "WHERE book_state.is_started IS 1 AND book_state.is_read IS NOT 1
        AND NOT EXISTS (SELECT 1 FROM reading_session AS later
            WHERE later.book_id = reading_session.book_id
                AND later.started_at_ms > reading_session.started_at_ms)"
);
const UNFINISHED_BEFORE: &str = from_sessions!(
    "WHERE book_state.is_started IS 1 AND book_state.is_read IS NOT 1
        AND NOT EXISTS (SELECT 1 FROM reading_session AS later
            WHERE later.book_id = reading_session.book_id
                AND later.started_at_ms > reading_session.started_at_ms)
        AND (reading_session.started_at_ms, reading_session.id) < (:after_started_at_ms, :after_id)"
);
const FIRST_BOOKS: &str = from_sessions!(
    "WHERE NOT EXISTS (SELECT 1 FROM reading_session AS later
            WHERE later.book_id = reading_session.book_id
                AND later.started_at_ms > reading_session.started_at_ms)
        AND reading_session.started_at_ms
            > coalesce((SELECT cleared_at_ms FROM history_cleared WHERE id = 1), -1)
        AND reading_session.started_at_ms > coalesce((SELECT hidden_at_ms FROM history_hidden
            WHERE history_hidden.book_id = reading_session.book_id), -1)
        AND (:matching = ''
            OR instr(fold_case(series.title), :matching) > 0
            OR instr(fold_case(book.title), :matching) > 0)"
);
const BOOKS_BEFORE: &str = from_sessions!(
    "WHERE NOT EXISTS (SELECT 1 FROM reading_session AS later
            WHERE later.book_id = reading_session.book_id
                AND later.started_at_ms > reading_session.started_at_ms)
        AND reading_session.started_at_ms
            > coalesce((SELECT cleared_at_ms FROM history_cleared WHERE id = 1), -1)
        AND reading_session.started_at_ms > coalesce((SELECT hidden_at_ms FROM history_hidden
            WHERE history_hidden.book_id = reading_session.book_id), -1)
        AND (:matching = ''
            OR instr(fold_case(series.title), :matching) > 0
            OR instr(fold_case(book.title), :matching) > 0)
        AND (reading_session.started_at_ms, reading_session.id) < (:after_started_at_ms, :after_id)"
);
const HIDDEN_AT: &str = "SELECT hidden_at_ms FROM history_hidden WHERE book_id = ?1";
const HIDE: &str = "INSERT INTO history_hidden (book_id, hidden_at_ms) VALUES (?1, ?2)
    ON CONFLICT (book_id) DO UPDATE SET hidden_at_ms = excluded.hidden_at_ms";
const SHOW: &str = "DELETE FROM history_hidden WHERE book_id = ?1";
const CLEARED_AT: &str = "SELECT cleared_at_ms FROM history_cleared WHERE id = 1";
const CLEAR: &str = "INSERT INTO history_cleared (id, cleared_at_ms) VALUES (1, ?1)
    ON CONFLICT (id) DO UPDATE SET cleared_at_ms = excluded.cleared_at_ms";
const UNCLEAR: &str = "DELETE FROM history_cleared WHERE id = 1";
const READING_TIME_BY_DAY: &str = "SELECT local_day, sum(ended_at_ms - started_at_ms) AS read_ms
    FROM reading_session
    WHERE local_day BETWEEN ?1 AND ?2
    GROUP BY local_day";
const READING_SINCE: &str = "SELECT coalesce(sum(ended_at_ms - started_at_ms), 0) AS read_ms,
        count(DISTINCT book_id) AS books_opened,
        count(DISTINCT CASE WHEN page + 1 >= page_count THEN book_id END) AS books_finished
    FROM reading_session
    WHERE local_day >= ?1";
const BOOK_SESSIONS: &str = "SELECT count(*) AS sessions,
        coalesce(sum(ended_at_ms - started_at_ms), 0) AS read_ms,
        min(local_day) AS first_day, max(local_day) AS last_day
    FROM reading_session
    WHERE book_id = ?1";
const SERIES_READ: &str = "SELECT series.id, series.title
    FROM series
    WHERE series.book_count > 0
        AND EXISTS (SELECT 1 FROM book
            CROSS JOIN reading_session ON reading_session.book_id = book.id
            WHERE book.series_local_id = series.local_id)
    ORDER BY series.title_key, series.id";
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

/// Which sessions a page of history lists.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum HistoryOf {
    Everything,
    Series(SeriesId),
    Book(BookId),
    /// The latest session of each book started and not marked read.
    Unfinished,
    /// The latest session of each book read since History was cleared or the book removed from it, whose series or book title holds `matching` when it isn't empty.
    Books {
        matching: String,
    },
}

/// Lists the sessions of books still in the library, the latest started first.
#[tracing::instrument(skip_all, fields(?of, size = ?request.size))]
pub fn history_page(
    connection: &Connection,
    of: &HistoryOf,
    request: &PageRequest,
) -> Result<Page<HistoryEntry>, Error> {
    let limit = request.size.rows_to_fetch();
    let after = match request.after.as_ref().map(|cursor| &cursor.0) {
        None => None,
        Some(Position::Session { started_at_ms, id }) => Some((*started_at_ms, *id)),
        Some(
            Position::Title { .. }
            | Position::Added { .. }
            | Position::Book { .. }
            | Position::Root { .. }
            | Position::LastRead { .. }
            | Position::LastUpdated { .. },
        ) => return Err(Error::CursorForAnotherList),
    };
    let matching;
    let (first, before, filter) = match of {
        HistoryOf::Everything => (FIRST_SESSIONS, SESSIONS_BEFORE, None),
        HistoryOf::Books { matching: text } => {
            matching = fold_case(text);
            (
                FIRST_BOOKS,
                BOOKS_BEFORE,
                Some((":matching", &matching as &dyn ToSql)),
            )
        }
        HistoryOf::Unfinished => (FIRST_UNFINISHED, UNFINISHED_BEFORE, None),
        HistoryOf::Series(series) => (
            FIRST_SESSIONS_OF_SERIES,
            SESSIONS_OF_SERIES_BEFORE,
            Some((":series", series.as_bytes() as &dyn ToSql)),
        ),
        HistoryOf::Book(book) => (
            FIRST_SESSIONS_OF_BOOK,
            SESSIONS_OF_BOOK_BEFORE,
            Some((":book", book.as_bytes() as &dyn ToSql)),
        ),
    };
    let mut params: Vec<(&str, &dyn ToSql)> = vec![(":limit", &limit)];
    if let Some((name, value)) = filter {
        params.push((name, value));
    }
    let sql = match &after {
        None => first,
        Some((started_at_ms, id)) => {
            params.extend([
                (":after_started_at_ms", started_at_ms as &dyn ToSql),
                (":after_id", id),
            ]);
            before
        }
    };
    let rows = read(connection.prepare(sql)?, &params)?;
    Ok(Page::of(rows, request.size))
}

/// Hides a book's sessions so far from History, returning the mark it was hidden behind before, for Undo.
pub fn hide_book_from_history(
    transaction: &Transaction<'_>,
    book: BookId,
    at_ms: i64,
) -> Result<Option<i64>, Error> {
    let before = transaction
        .prepare(HIDDEN_AT)?
        .query_row([book.as_bytes()], |row| row.get(0))
        .optional()?;
    transaction
        .prepare(HIDE)?
        .execute((book.as_bytes(), at_ms))?;
    Ok(before)
}

pub fn restore_book_to_history(
    transaction: &Transaction<'_>,
    book: BookId,
    mark: Option<i64>,
) -> Result<(), Error> {
    match mark {
        Some(at_ms) => transaction
            .prepare(HIDE)?
            .execute((book.as_bytes(), at_ms))?,
        None => transaction.prepare(SHOW)?.execute([book.as_bytes()])?,
    };
    Ok(())
}

/// Hides every session so far from History, returning the mark it was cleared at before, for Undo.
pub fn clear_history(transaction: &Transaction<'_>, at_ms: i64) -> Result<Option<i64>, Error> {
    let before = transaction
        .prepare(CLEARED_AT)?
        .query_row([], |row| row.get(0))
        .optional()?;
    transaction.prepare(CLEAR)?.execute([at_ms])?;
    Ok(before)
}

pub fn restore_history(transaction: &Transaction<'_>, mark: Option<i64>) -> Result<(), Error> {
    match mark {
        Some(at_ms) => transaction.prepare(CLEAR)?.execute([at_ms])?,
        None => transaction.prepare(UNCLEAR)?.execute([])?,
    };
    Ok(())
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

/// A book's reading sessions added up, its first and last days counted from 1970-01-01 in the local time each began at.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct BookSessions {
    pub sessions: u32,
    pub read_ms: i64,
    pub first_day: i64,
    pub last_day: i64,
}

/// Adds up `book`'s sessions, giving none for a book never read.
pub fn book_sessions(connection: &Connection, book: BookId) -> Result<Option<BookSessions>, Error> {
    Ok(connection
        .prepare(BOOK_SESSIONS)?
        .query_row([book.as_bytes()], |row| {
            let first_day: Option<i64> = row.get("first_day")?;
            let last_day: Option<i64> = row.get("last_day")?;
            let (sessions, read_ms) = (row.get("sessions")?, row.get("read_ms")?);
            Ok(first_day
                .zip(last_day)
                .map(|(first_day, last_day)| BookSessions {
                    sessions,
                    read_ms,
                    first_day,
                    last_day,
                }))
        })?)
}

/// The series in the library with any reading, in title order.
pub fn series_read(connection: &Connection) -> Result<Vec<(SeriesId, String)>, Error> {
    let mut statement = connection.prepare(SERIES_READ)?;
    let rows = statement.query_map([], |row| Ok((stored_id(row, "id")?, row.get("title")?)))?;
    Ok(rows.collect::<Result<_, _>>()?)
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

    const SESSION_DETAILS: [&str; 6] = [
        "SEARCH cover USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN",
        "CORRELATED SCALAR SUBQUERY 2",
        "SEARCH book_file USING COVERING INDEX book_file_by_book (book_id=?)",
        "SEARCH book_state USING PRIMARY KEY (book_id=?) LEFT-JOIN",
        "CORRELATED SCALAR SUBQUERY 1",
        "SEARCH earlier USING COVERING INDEX book_by_series (series_local_id=? AND (title_sort_key,id)<(?,?))",
    ];

    fn plan_of(walk: &[&str], sort: &[&str]) -> Vec<String> {
        [walk, &SESSION_DETAILS, sort]
            .concat()
            .into_iter()
            .map(str::to_owned)
            .collect()
    }

    fn sessions_plan(walk: &str) -> Vec<String> {
        plan_of(
            &[
                walk,
                "SEARCH book USING PRIMARY KEY (id=?)",
                "SEARCH series USING INTEGER PRIMARY KEY (rowid=?)",
            ],
            &[],
        )
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
    fn lists_a_series_sessions_from_its_books_alone() {
        let scratch = ScratchLibrary::new("series-sessions-plan");

        let plans = [FIRST_SESSIONS_OF_SERIES, SESSIONS_OF_SERIES_BEFORE]
            .map(|sql| scratch.query_plan(sql));

        let walk = |sessions: &str| {
            plan_of(
                &[
                    "SEARCH series USING INDEX sqlite_autoindex_series_1 (id=?)",
                    "SEARCH book USING INDEX book_by_series_and_added (series_local_id=?)",
                    sessions,
                ],
                &["USE TEMP B-TREE FOR ORDER BY"],
            )
        };
        assert_eq!(
            plans,
            [
                walk("SEARCH reading_session USING INDEX reading_session_by_book (book_id=?)"),
                walk(
                    "SEARCH reading_session USING INDEX reading_session_by_book (book_id=? AND started_at_ms<?)"
                ),
            ]
        );
    }

    #[test]
    fn walks_back_through_the_start_index_since_history_was_cleared_without_sorting() {
        let scratch = ScratchLibrary::new("books-read-plan");

        let plans = [FIRST_BOOKS, BOOKS_BEFORE].map(|sql| scratch.query_plan(sql));

        let walks = plans.each_ref().map(|plan| plan.first().cloned());
        let sorts = plans
            .each_ref()
            .map(|plan| plan.iter().any(|step| step.starts_with("USE TEMP B-TREE")));
        assert_eq!(
            (walks, sorts),
            (
                [
                    Some(
                        "SEARCH reading_session USING INDEX reading_session_by_start (started_at_ms>?)"
                            .to_owned()
                    ),
                    Some(
                        "SEARCH reading_session USING INDEX reading_session_by_start (started_at_ms>? AND started_at_ms<?)"
                            .to_owned()
                    ),
                ],
                [false, false]
            )
        );
    }

    #[test]
    fn walks_back_through_the_start_index_for_the_books_to_continue() {
        let scratch = ScratchLibrary::new("unfinished-plan");

        let plans = [FIRST_UNFINISHED, UNFINISHED_BEFORE].map(|sql| scratch.query_plan(sql));

        let walk = |sessions: &str| {
            plan_of(
                &[
                    sessions,
                    "CORRELATED SCALAR SUBQUERY 3",
                    "SEARCH later USING COVERING INDEX reading_session_by_book (book_id=? AND started_at_ms>?)",
                    "SEARCH book USING PRIMARY KEY (id=?)",
                    "SEARCH series USING INTEGER PRIMARY KEY (rowid=?)",
                ],
                &[],
            )
        };
        assert_eq!(
            plans,
            [
                walk("SCAN reading_session USING INDEX reading_session_by_start"),
                walk(
                    "SEARCH reading_session USING INDEX reading_session_by_start (started_at_ms<?)"
                ),
            ]
        );
    }

    #[test]
    fn lists_a_book_s_sessions_from_the_book_index() {
        let scratch = ScratchLibrary::new("book-sessions-plan");

        let plans =
            [FIRST_SESSIONS_OF_BOOK, SESSIONS_OF_BOOK_BEFORE].map(|sql| scratch.query_plan(sql));

        let walk = |sessions: &str| {
            plan_of(
                &[
                    sessions,
                    "SEARCH book USING PRIMARY KEY (id=?)",
                    "SEARCH series USING INTEGER PRIMARY KEY (rowid=?)",
                ],
                &["USE TEMP B-TREE FOR LAST TERM OF ORDER BY"],
            )
        };
        assert_eq!(
            plans,
            [
                walk("SEARCH reading_session USING INDEX reading_session_by_book (book_id=?)"),
                walk(
                    "SEARCH reading_session USING INDEX reading_session_by_book (book_id=? AND started_at_ms<?)"
                ),
            ]
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
    fn adds_up_a_book_s_sessions_from_the_book_index() {
        let scratch = ScratchLibrary::new("book-sessions-sum-plan");

        let plan = scratch.query_plan(BOOK_SESSIONS);

        assert_eq!(
            plan,
            ["SEARCH reading_session USING INDEX reading_session_by_book (book_id=?)"]
        );
    }

    #[test]
    fn looks_for_each_series_reading_through_the_book_and_session_indexes() {
        let scratch = ScratchLibrary::new("series-read-plan");

        let plan = scratch.query_plan(SERIES_READ);

        assert_eq!(
            plan,
            [
                "SCAN series",
                "CORRELATED SCALAR SUBQUERY 1",
                "SEARCH book USING COVERING INDEX book_by_series_and_added (series_local_id=?)",
                "SEARCH reading_session USING COVERING INDEX reading_session_by_book (book_id=?)",
                "USE TEMP B-TREE FOR ORDER BY",
            ]
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
