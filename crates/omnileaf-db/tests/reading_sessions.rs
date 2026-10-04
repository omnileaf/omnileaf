#![expect(
    clippy::unwrap_used,
    reason = "each test builds its own scratch library, so a failed set-up should stop the test"
)]

#[expect(
    dead_code,
    reason = "these tests record reading sessions but never write a book's reading state"
)]
mod store_support;
mod support;

use omnileaf_db::store::{Continuity, SessionPlace, Store};
use omnileaf_sync_proto::BookId;
use store_support::{FakeClock, NOW_UNIX_MS, book, open_store};
use support::ScratchFolder;

const MINUTE_MS: u64 = 60_000;
const RESUME_GAP_MS: u64 = 2 * MINUTE_MS;
const PAGE_COUNT: u32 = 24;
const UTC_PLUS_TEN: i16 = 600;
const DAY_MS: u64 = 86_400_000;

#[derive(Debug, PartialEq, Eq)]
struct StoredSession {
    book: BookId,
    started_at_ms: u64,
    ended_at_ms: u64,
    utc_offset_minutes: i16,
    page: u32,
    page_count: u32,
}

struct Reading {
    store: Store,
    clock: FakeClock,
    _folder: ScratchFolder,
}

impl Reading {
    fn open(name: &str) -> Self {
        let folder = ScratchFolder::new(name);
        let clock = FakeClock::at(NOW_UNIX_MS);
        Self {
            store: open_store(&folder, clock.clone()),
            clock,
            _folder: folder,
        }
    }

    async fn read_at(&self, at_ms: u64, book: BookId, page: u32) {
        self.read_in_zone(at_ms, book, page, UTC_PLUS_TEN).await;
    }

    async fn read_in_zone(&self, at_ms: u64, book: BookId, page: u32, utc_offset_minutes: i16) {
        self.record(
            at_ms,
            book,
            page,
            utc_offset_minutes,
            Continuity::AfterBreak,
        )
        .await;
    }

    async fn read_on_at(&self, at_ms: u64, book: BookId, page: u32) {
        self.record(at_ms, book, page, UTC_PLUS_TEN, Continuity::Unbroken)
            .await;
    }

    async fn record(
        &self,
        at_ms: u64,
        book: BookId,
        page: u32,
        utc_offset_minutes: i16,
        continuity: Continuity,
    ) {
        self.clock.set(at_ms);
        let place = SessionPlace {
            book,
            page,
            page_count: PAGE_COUNT,
            utc_offset_minutes,
        };
        self.store
            .write(move |writer| writer.record_reading(&place, continuity))
            .await
            .unwrap();
    }

    async fn stop_at(&self, at_ms: u64, book: BookId) {
        self.stop(at_ms, book, Continuity::AfterBreak).await;
    }

    async fn stop(&self, at_ms: u64, book: BookId, continuity: Continuity) {
        self.clock.set(at_ms);
        self.store
            .write(move |writer| writer.record_reading_stopped(book, continuity))
            .await
            .unwrap();
    }

    async fn sessions(&self) -> Vec<StoredSession> {
        self.store
            .database()
            .read(|connection| {
                let mut statement = connection.prepare(
                    "SELECT book_id, started_at_ms, ended_at_ms, utc_offset_minutes, page, page_count
                    FROM reading_session ORDER BY id",
                )?;
                let sessions = statement.query_map([], |row| {
                    Ok(StoredSession {
                        book: BookId::try_from(row.get::<_, Vec<u8>>(0)?.as_slice()).unwrap(),
                        started_at_ms: row.get(1)?,
                        ended_at_ms: row.get(2)?,
                        utc_offset_minutes: row.get(3)?,
                        page: row.get(4)?,
                        page_count: row.get(5)?,
                    })
                })?;
                Ok(sessions.collect::<Result<Vec<_>, _>>()?)
            })
            .await
            .unwrap()
    }

    async fn local_days(&self) -> Vec<i64> {
        self.store
            .database()
            .read(|connection| {
                let mut statement =
                    connection.prepare("SELECT local_day FROM reading_session ORDER BY id")?;
                let days = statement.query_map([], |row| row.get(0))?;
                Ok(days.collect::<Result<Vec<_>, _>>()?)
            })
            .await
            .unwrap()
    }
}

fn session(book: BookId, started_at_ms: u64, ended_at_ms: u64, page: u32) -> StoredSession {
    StoredSession {
        book,
        started_at_ms,
        ended_at_ms,
        utc_offset_minutes: UTC_PLUS_TEN,
        page,
        page_count: PAGE_COUNT,
    }
}

#[tokio::test]
async fn starts_a_session_where_reading_begins() {
    let reading = Reading::open("session-start");

    reading.read_at(NOW_UNIX_MS, book(1), 3).await;

    assert_eq!(
        reading.sessions().await,
        [session(book(1), NOW_UNIX_MS, NOW_UNIX_MS, 3)]
    );
}

#[tokio::test]
async fn carries_on_the_session_while_the_same_book_is_read() {
    let reading = Reading::open("session-carried-on");
    reading.read_at(NOW_UNIX_MS, book(1), 3).await;

    reading.read_at(NOW_UNIX_MS + MINUTE_MS, book(1), 5).await;

    assert_eq!(
        reading.sessions().await,
        [session(book(1), NOW_UNIX_MS, NOW_UNIX_MS + MINUTE_MS, 5)]
    );
}

#[tokio::test]
async fn carries_on_a_session_of_a_book_opened_again_within_two_minutes_of_stopping() {
    let reading = Reading::open("session-reopened");
    reading.read_at(NOW_UNIX_MS, book(1), 3).await;
    reading.stop_at(NOW_UNIX_MS + MINUTE_MS, book(1)).await;

    let reopened_ms = NOW_UNIX_MS + MINUTE_MS + RESUME_GAP_MS;
    reading.read_at(reopened_ms, book(1), 3).await;

    assert_eq!(
        reading.sessions().await,
        [session(book(1), NOW_UNIX_MS, reopened_ms, 3)]
    );
}

#[tokio::test]
async fn starts_a_new_session_once_more_than_two_minutes_passed_without_reading() {
    let reading = Reading::open("session-after-a-break");
    reading.read_at(NOW_UNIX_MS, book(1), 3).await;

    let back_ms = NOW_UNIX_MS + RESUME_GAP_MS + 1;
    reading.read_at(back_ms, book(1), 4).await;

    assert_eq!(
        reading.sessions().await,
        [
            session(book(1), NOW_UNIX_MS, NOW_UNIX_MS, 3),
            session(book(1), back_ms, back_ms, 4),
        ]
    );
}

#[tokio::test]
async fn carries_on_the_session_however_long_a_page_was_shown_while_reading_goes_on_unbroken() {
    let reading = Reading::open("session-long-page");
    reading.read_at(NOW_UNIX_MS, book(1), 3).await;

    let turned_ms = NOW_UNIX_MS + 3 * RESUME_GAP_MS;
    reading.read_on_at(turned_ms, book(1), 4).await;

    assert_eq!(
        reading.sessions().await,
        [session(book(1), NOW_UNIX_MS, turned_ms, 4)]
    );
}

#[tokio::test]
async fn ends_the_session_however_long_its_last_page_was_shown_while_reading_went_on_unbroken() {
    let reading = Reading::open("session-long-last-page");
    reading.read_at(NOW_UNIX_MS, book(1), 3).await;

    let closed_ms = NOW_UNIX_MS + 3 * RESUME_GAP_MS;
    reading.stop(closed_ms, book(1), Continuity::Unbroken).await;

    assert_eq!(
        reading.sessions().await,
        [session(book(1), NOW_UNIX_MS, closed_ms, 3)]
    );
}

#[tokio::test]
async fn starts_a_new_session_for_another_book_even_while_reading_goes_on_unbroken() {
    let reading = Reading::open("session-unbroken-other-book");
    reading.read_at(NOW_UNIX_MS, book(1), 3).await;

    reading
        .read_on_at(NOW_UNIX_MS + MINUTE_MS, book(2), 0)
        .await;

    assert_eq!(
        reading.sessions().await,
        [
            session(book(1), NOW_UNIX_MS, NOW_UNIX_MS, 3),
            session(book(2), NOW_UNIX_MS + MINUTE_MS, NOW_UNIX_MS + MINUTE_MS, 0),
        ]
    );
}

#[tokio::test]
async fn starts_a_new_session_for_another_book() {
    let reading = Reading::open("session-other-book");
    reading.read_at(NOW_UNIX_MS, book(1), 3).await;

    reading.read_at(NOW_UNIX_MS + MINUTE_MS, book(2), 0).await;

    assert_eq!(
        reading.sessions().await,
        [
            session(book(1), NOW_UNIX_MS, NOW_UNIX_MS, 3),
            session(book(2), NOW_UNIX_MS + MINUTE_MS, NOW_UNIX_MS + MINUTE_MS, 0),
        ]
    );
}

#[tokio::test]
async fn carries_on_the_session_written_last_after_the_clock_is_set_back() {
    let reading = Reading::open("session-clock-set-back");
    reading.read_at(NOW_UNIX_MS, book(1), 3).await;
    let set_back_ms = NOW_UNIX_MS - 60 * MINUTE_MS;
    reading.read_at(set_back_ms, book(2), 0).await;

    reading.read_at(set_back_ms + MINUTE_MS, book(2), 1).await;

    assert_eq!(
        reading.sessions().await,
        [
            session(book(1), NOW_UNIX_MS, NOW_UNIX_MS, 3),
            session(book(2), set_back_ms, set_back_ms + MINUTE_MS, 1),
        ]
    );
}

#[tokio::test]
async fn ends_the_session_when_reading_stops() {
    let reading = Reading::open("session-stopped");
    reading.read_at(NOW_UNIX_MS, book(1), 3).await;

    reading.stop_at(NOW_UNIX_MS + MINUTE_MS, book(1)).await;

    assert_eq!(
        reading.sessions().await,
        [session(book(1), NOW_UNIX_MS, NOW_UNIX_MS + MINUTE_MS, 3)]
    );
}

#[tokio::test]
async fn ends_a_session_left_more_than_two_minutes_before_it_stops_where_reading_last_was() {
    let reading = Reading::open("session-stopped-late");
    reading.read_at(NOW_UNIX_MS, book(1), 3).await;

    reading
        .stop_at(NOW_UNIX_MS + RESUME_GAP_MS + 1, book(1))
        .await;

    assert_eq!(
        reading.sessions().await,
        [session(book(1), NOW_UNIX_MS, NOW_UNIX_MS, 3)]
    );
}

#[tokio::test]
async fn leaves_the_session_of_another_book_as_it_is_when_reading_stops() {
    let reading = Reading::open("session-stopped-other");
    reading.read_at(NOW_UNIX_MS, book(1), 3).await;

    reading.stop_at(NOW_UNIX_MS + MINUTE_MS, book(2)).await;

    assert_eq!(
        reading.sessions().await,
        [session(book(1), NOW_UNIX_MS, NOW_UNIX_MS, 3)]
    );
}

#[tokio::test]
async fn records_nothing_when_reading_stops_with_no_session() {
    let reading = Reading::open("session-stopped-none");

    reading.stop_at(NOW_UNIX_MS, book(1)).await;

    assert_eq!(reading.sessions().await, []);
}

#[tokio::test]
async fn days_a_session_by_the_local_time_it_started_at() {
    let reading = Reading::open("session-local-day");
    let midnight_utc_ms = NOW_UNIX_MS - NOW_UNIX_MS % DAY_MS;
    let utc_day = i64::try_from(midnight_utc_ms / DAY_MS).unwrap();

    reading
        .read_in_zone(midnight_utc_ms - 30 * MINUTE_MS, book(1), 0, 60)
        .await;
    reading
        .read_in_zone(midnight_utc_ms + 30 * MINUTE_MS, book(2), 0, -60)
        .await;

    assert_eq!(reading.local_days().await, [utc_day, utc_day - 1]);
}
