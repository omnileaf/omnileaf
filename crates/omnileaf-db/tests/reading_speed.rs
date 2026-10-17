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

use omnileaf_db::{
    reading_speed::seconds_per_page,
    store::{Continuity, SessionPlace, Store},
};
use omnileaf_sync_proto::BookId;
use store_support::{FakeClock, NOW_UNIX_MS, book, open_store};
use support::ScratchFolder;

const SECOND_MS: u64 = 1_000;
const BREAK_MS: u64 = 10 * 60 * SECOND_MS;
const PAGE_COUNT: u32 = 400;
const SESSIONS_LEARNED_FROM: u32 = 30;

struct Reading {
    store: Store,
    clock: FakeClock,
    now_ms: u64,
    _folder: ScratchFolder,
}

impl Reading {
    fn open(name: &str) -> Self {
        let folder = ScratchFolder::new(name);
        let clock = FakeClock::at(NOW_UNIX_MS);
        Self {
            store: open_store(&folder, clock.clone()),
            clock,
            now_ms: NOW_UNIX_MS,
            _folder: folder,
        }
    }

    async fn session(&mut self, book: BookId, from: u32, to: u32, seconds_a_page: u64) {
        self.show(book, from).await;
        for page in from + 1..=to {
            self.now_ms += seconds_a_page * SECOND_MS;
            self.show_on(book, page, Continuity::Unbroken).await;
        }
        self.now_ms += BREAK_MS;
    }

    async fn show(&self, book: BookId, page: u32) {
        self.show_on(book, page, Continuity::AfterBreak).await;
    }

    async fn show_on(&self, book: BookId, page: u32, continuity: Continuity) {
        self.clock.set(self.now_ms);
        let place = SessionPlace {
            book,
            page,
            page_count: PAGE_COUNT,
            utc_offset_minutes: 0,
        };
        self.store
            .write(move |writer| writer.record_reading(&place, continuity))
            .await
            .unwrap();
    }

    async fn seconds_per_page(&self) -> Option<u32> {
        self.store.database().read(seconds_per_page).await.unwrap()
    }
}

#[tokio::test]
async fn knows_no_reading_speed_before_anything_is_read() {
    let reading = Reading::open("speed-unread");

    assert_eq!(reading.seconds_per_page().await, None);
}

#[tokio::test]
async fn learns_the_middle_time_a_page_took_across_the_latest_sessions() {
    let mut reading = Reading::open("speed-middle");
    reading.session(book(1), 0, 10, 10).await;
    reading.session(book(2), 10, 20, 20).await;
    reading.session(book(3), 20, 25, 15).await;

    assert_eq!(reading.seconds_per_page().await, Some(15));
}

#[tokio::test]
async fn learns_from_where_each_session_started_rather_than_the_first_page() {
    let mut reading = Reading::open("speed-from-start");
    reading.session(book(1), 40, 50, 8).await;
    reading.session(book(1), 120, 124, 8).await;
    reading.session(book(2), 7, 9, 8).await;

    assert_eq!(reading.seconds_per_page().await, Some(8));
}

#[tokio::test]
async fn sets_aside_a_page_left_open_for_a_long_time() {
    let mut reading = Reading::open("speed-long-pause");
    reading.session(book(1), 0, 10, 12).await;
    reading.session(book(2), 0, 10, 14).await;
    reading.session(book(3), 0, 1, 3_600).await;
    reading.session(book(4), 0, 10, 10).await;
    reading.session(book(5), 0, 10, 13).await;

    assert_eq!(reading.seconds_per_page().await, Some(13));
}

#[tokio::test]
async fn waits_for_three_sessions_that_turned_pages_forward() {
    let mut reading = Reading::open("speed-too-few");
    reading.session(book(1), 0, 10, 10).await;
    reading.session(book(2), 30, 30, 10).await;
    reading.show(book(3), 50).await;
    reading.now_ms += BREAK_MS;
    reading.show(book(3), 20).await;
    reading.now_ms += BREAK_MS;
    reading.session(book(4), 0, 10, 10).await;

    assert_eq!(reading.seconds_per_page().await, None);
}

#[tokio::test]
async fn learns_only_from_the_latest_sessions() {
    let mut reading = Reading::open("speed-latest");
    for number in 0..=SESSIONS_LEARNED_FROM {
        reading.session(book(number), 0, 2, 60).await;
    }
    for number in 0..SESSIONS_LEARNED_FROM {
        reading.session(book(100 + number), 0, 2, 10).await;
    }

    assert_eq!(reading.seconds_per_page().await, Some(10));
}
