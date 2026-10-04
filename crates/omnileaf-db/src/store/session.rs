use omnileaf_sync_proto::BookId;
use rusqlite::{Connection, OptionalExtension};

use crate::{Error, catalog::stored_id::stored_id};

/// How long reading can stop before going on with the same book counts as a new session.
const RESUME_GAP_MS: i64 = 120_000;

/// The session written last, which a clock set back can leave starting before an earlier one.
const LATEST_SESSION: &str = "SELECT id, book_id, ended_at_ms FROM reading_session
    ORDER BY id DESC
    LIMIT 1";
const CARRY_ON: &str = "UPDATE reading_session
    SET ended_at_ms = max(ended_at_ms, ?2), page = ?3, page_count = ?4
    WHERE id = ?1";
const STOP: &str = "UPDATE reading_session SET ended_at_ms = max(ended_at_ms, ?2) WHERE id = ?1";
const START: &str = "INSERT INTO reading_session
    (book_id, started_at_ms, ended_at_ms, utc_offset_minutes, page, page_count)
    VALUES (?1, ?2, ?2, ?3, ?4, ?5)";

/// Where reading stands in a book at one moment, counting pages from 0.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SessionPlace {
    pub book: BookId,
    pub page: u32,
    pub page_count: u32,
    /// How far the device's clock was ahead of UTC, so the session keeps the local time it was read at.
    pub utc_offset_minutes: i16,
}

struct LatestSession {
    id: i64,
    book: BookId,
    ended_at_ms: i64,
}

impl LatestSession {
    fn goes_on_with(&self, book: BookId, at_ms: i64) -> bool {
        self.book == book && at_ms.saturating_sub(self.ended_at_ms) <= RESUME_GAP_MS
    }
}

pub(crate) fn record_reading(
    connection: &Connection,
    at_ms: i64,
    place: &SessionPlace,
) -> Result<(), Error> {
    match latest_session(connection)?.filter(|latest| latest.goes_on_with(place.book, at_ms)) {
        Some(latest) => {
            connection.execute(CARRY_ON, (latest.id, at_ms, place.page, place.page_count))?
        }
        None => connection.execute(
            START,
            (
                place.book.as_bytes(),
                at_ms,
                place.utc_offset_minutes,
                place.page,
                place.page_count,
            ),
        )?,
    };
    Ok(())
}

pub(crate) fn record_reading_stopped(
    connection: &Connection,
    at_ms: i64,
    book: BookId,
) -> Result<(), Error> {
    if let Some(latest) =
        latest_session(connection)?.filter(|latest| latest.goes_on_with(book, at_ms))
    {
        connection.execute(STOP, (latest.id, at_ms))?;
    }
    Ok(())
}

fn latest_session(connection: &Connection) -> Result<Option<LatestSession>, Error> {
    Ok(connection
        .prepare(LATEST_SESSION)?
        .query_row([], |row| {
            Ok(LatestSession {
                id: row.get("id")?,
                book: stored_id(row, "book_id")?,
                ended_at_ms: row.get("ended_at_ms")?,
            })
        })
        .optional()?)
}

#[cfg(test)]
mod tests {
    use omnileaf_sync_proto::{Fingerprint, ImageEntry};
    use proptest::{prelude::*, test_runner::TestRunner};

    use super::*;
    use crate::{Database, scratch::ScratchLibrary};

    const DAY_MS: i64 = 86_400_000;
    const MINUTE_MS: i64 = 60_000;
    const FURTHEST_OFFSET_MINUTES: i16 = 18 * 60;
    const YEAR_10000_MS: i64 = 253_402_300_800_000;

    #[test]
    fn days_every_session_by_the_local_date_it_started_on() {
        let scratch = ScratchLibrary::new("session-local-day");
        drop(Database::open(&scratch.config).unwrap());
        let connection = Connection::open(&scratch.config.path).unwrap();
        let place = |utc_offset_minutes| SessionPlace {
            book: BookId::local(&Fingerprint::pmf1([ImageEntry { crc32: 1, size: 1 }]).unwrap()),
            page: 0,
            page_count: 1,
            utc_offset_minutes,
        };
        let moments = (
            0..YEAR_10000_MS,
            -FURTHEST_OFFSET_MINUTES..=FURTHEST_OFFSET_MINUTES,
        );

        let outcome = TestRunner::default().run(&moments, |(at_ms, offset)| {
            connection
                .execute("DELETE FROM reading_session", [])
                .unwrap();
            record_reading(&connection, at_ms, &place(offset)).unwrap();
            let day: i64 = connection
                .query_row("SELECT local_day FROM reading_session", [], |row| {
                    row.get(0)
                })
                .unwrap();
            let local_ms = at_ms + i64::from(offset) * MINUTE_MS;
            prop_assert_eq!(day, local_ms.div_euclid(DAY_MS));
            Ok(())
        });

        outcome.unwrap();
    }

    #[test]
    fn finds_the_latest_session_at_the_end_of_the_table_with_no_sort() {
        let scratch = ScratchLibrary::new("latest-session-plan");

        let plan = scratch.query_plan(LATEST_SESSION);

        assert_eq!(plan, ["SCAN reading_session"]);
    }

    #[test]
    fn goes_on_with_a_session_by_its_key() {
        let scratch = ScratchLibrary::new("carry-on-plan");

        let plans = [CARRY_ON, STOP].map(|sql| scratch.query_plan(sql));

        let by_key = ["SEARCH reading_session USING INTEGER PRIMARY KEY (rowid=?)"];
        assert_eq!(plans, [by_key, by_key]);
    }
}
