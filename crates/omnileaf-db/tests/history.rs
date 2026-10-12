#![expect(
    clippy::unwrap_used,
    reason = "each test builds its own scratch library, so a failed set-up should stop the test"
)]

#[expect(
    dead_code,
    reason = "these tests read history but never raise a book's furthest page"
)]
mod store_support;
mod support;

use std::{
    collections::BTreeMap,
    ops::RangeInclusive,
    path::{Path, PathBuf},
};

use omnileaf_db::{
    Error,
    catalog::{
        BookFile, BookReading, Cursor, NewRoot, NewSeries, Page, PageRequest, PageSize, RootId,
        RootKind, RootLocator, ScannedBook, add_root, record_scanned_books, remove_book_files,
        remove_books_without_files,
    },
    history::{HistoryEntry, history_page, reading_time_by_day, reading_time_since},
    store::{Continuity, SessionPlace, Store},
};
use omnileaf_sync_proto::{BookId, Fingerprint, ImageEntry, SeriesId};
use store_support::{FakeClock, NOW_UNIX_MS, book, open_store};
use support::ScratchFolder;

const ADDED_AT_MS: i64 = 1_780_000_000_000;
const ROOT_FOLDER: &str = "/media/Sample Library";
const FIRST_SERIES: &str = "Sample Series 01";
const SECOND_SERIES: &str = "Sample Series 02";
const MINUTE_MS: u64 = 60_000;
const HOUR_MS: u64 = 60 * MINUTE_MS;
const DAY_MS: u64 = 24 * HOUR_MS;
const PAGE_COUNT: u32 = 24;
const UTC_PLUS_TEN: i16 = 600;

fn local_day_of(at_ms: u64) -> i64 {
    (ms(at_ms) + i64::from(UTC_PLUS_TEN) * ms(MINUTE_MS)).div_euclid(ms(DAY_MS))
}

fn today() -> i64 {
    local_day_of(NOW_UNIX_MS)
}

struct History {
    store: Store,
    clock: FakeClock,
    root: RootId,
    _folder: ScratchFolder,
}

impl History {
    async fn open(name: &str) -> Self {
        let folder = ScratchFolder::new(name);
        let clock = FakeClock::at(NOW_UNIX_MS);
        let store = open_store(&folder, clock.clone());
        let root = NewRoot {
            kind: RootKind::Linked,
            locator: RootLocator::Path(PathBuf::from(ROOT_FOLDER)),
            added_at_ms: ADDED_AT_MS,
        };
        let root = store
            .database()
            .write(move |transaction| add_root(transaction, &root))
            .await
            .unwrap();
        let history = Self {
            store,
            clock,
            root,
            _folder: folder,
        };
        for number in 1..=3 {
            history.shelve(FIRST_SERIES, number).await;
        }
        history.shelve(SECOND_SERIES, 4).await;
        history
    }

    async fn shelve(&self, series: &str, number: u32) {
        let scanned = ScannedBook {
            series: NewSeries::local(series, ADDED_AT_MS).unwrap(),
            fingerprint: Fingerprint::pmf1([ImageEntry {
                crc32: number,
                size: 1,
            }])
            .unwrap(),
            title: title_of(series, number),
            added_at_ms: ADDED_AT_MS,
            file: BookFile {
                root: self.root,
                location: location_of(series, number),
                size_bytes: 100,
                modified_at_ms: ADDED_AT_MS,
            },
        };
        self.store
            .database()
            .write(move |transaction| record_scanned_books(transaction, &[scanned]))
            .await
            .unwrap();
    }

    async fn read(&self, book: BookId, from_ms: u64, to_ms: u64, page: u32) {
        let place = SessionPlace {
            book,
            page,
            page_count: PAGE_COUNT,
            utc_offset_minutes: UTC_PLUS_TEN,
        };
        let minutes = (from_ms..to_ms).step_by(usize::try_from(MINUTE_MS).unwrap());
        for at_ms in minutes.chain([to_ms]) {
            self.clock.set(at_ms);
            self.store
                .write(move |writer| writer.record_reading(&place, Continuity::AfterBreak))
                .await
                .unwrap();
        }
    }

    async fn mark_read(&self, book: BookId) {
        self.store
            .write(move |writer| writer.set_read(book, true))
            .await
            .unwrap();
    }

    async fn page(&self, size: u16, after: Option<Cursor>) -> Result<Page<HistoryEntry>, Error> {
        let request = PageRequest {
            after: after.map(|cursor| cursor.to_string().parse().unwrap()),
            size: PageSize::try_from(size).unwrap(),
        };
        self.store
            .database()
            .read(move |connection| history_page(connection, &request))
            .await
    }

    async fn listed_books(&self) -> Vec<BookId> {
        self.page(50, None)
            .await
            .unwrap()
            .items
            .iter()
            .map(|entry| entry.book)
            .collect()
    }

    async fn by_day(&self, days: RangeInclusive<i64>) -> BTreeMap<i64, i64> {
        self.store
            .database()
            .read(move |connection| reading_time_by_day(connection, days))
            .await
            .unwrap()
    }

    async fn since(&self, first_day: i64) -> i64 {
        self.store
            .database()
            .read(move |connection| reading_time_since(connection, first_day))
            .await
            .unwrap()
    }
}

fn title_of(series: &str, number: u32) -> String {
    format!("{series} v{number:02}")
}

fn location_of(series: &str, number: u32) -> PathBuf {
    Path::new(series).join(format!("{}.cbz", title_of(series, number)))
}

fn ms(duration_ms: u64) -> i64 {
    i64::try_from(duration_ms).unwrap()
}

#[tokio::test]
async fn lists_a_session_with_its_book_series_times_and_page_reached() {
    let history = History::open("history-entry").await;
    let started_ms = NOW_UNIX_MS - HOUR_MS;
    history
        .read(book(2), started_ms, started_ms + 20 * MINUTE_MS, 7)
        .await;

    let page = history.page(50, None).await.unwrap();

    let entry = page.items.first().unwrap();
    assert_eq!(entry.book, book(2));
    assert_eq!(entry.book_title, "Sample Series 01 v02");
    assert_eq!(entry.series_title, FIRST_SERIES);
    assert_eq!(
        entry.cover.map(|cover| (cover.book, cover.rev)),
        Some((book(2), 1))
    );
    assert_eq!(entry.started_at_ms, ms(started_ms));
    assert_eq!(entry.ended_at_ms, ms(started_ms + 20 * MINUTE_MS));
    assert_eq!(entry.utc_offset_minutes, UTC_PLUS_TEN);
    assert_eq!(entry.local_day, local_day_of(started_ms));
    assert_eq!((entry.page, entry.page_count), (7, PAGE_COUNT));
    assert_eq!(entry.reading, BookReading::NotStarted);
    assert_eq!(page.next, None);
}

#[tokio::test]
async fn lists_a_session_with_its_book_s_series_and_place_in_it() {
    let history = History::open("history-place").await;
    history.read(book(2), NOW_UNIX_MS, NOW_UNIX_MS, 0).await;
    history.read(book(4), NOW_UNIX_MS, NOW_UNIX_MS, 0).await;

    let page = history.page(50, None).await.unwrap();

    let places: Vec<(SeriesId, u32)> = page
        .items
        .iter()
        .map(|entry| (entry.series, entry.position))
        .collect();
    assert_eq!(
        places,
        [
            (SeriesId::local(SECOND_SERIES).unwrap(), 1),
            (SeriesId::local(FIRST_SERIES).unwrap(), 2),
        ]
    );
}

#[tokio::test]
async fn lists_sessions_the_latest_started_first() {
    let history = History::open("history-order").await;
    history
        .read(
            book(1),
            NOW_UNIX_MS - 3 * HOUR_MS,
            NOW_UNIX_MS - 3 * HOUR_MS,
            0,
        )
        .await;
    history
        .read(book(4), NOW_UNIX_MS - HOUR_MS, NOW_UNIX_MS - HOUR_MS, 0)
        .await;
    history
        .read(
            book(1),
            NOW_UNIX_MS - 2 * HOUR_MS,
            NOW_UNIX_MS - 2 * HOUR_MS,
            0,
        )
        .await;

    let listed = history.listed_books().await;

    assert_eq!(listed, [book(4), book(1), book(1)]);
}

#[tokio::test]
async fn pages_through_history_from_where_the_page_before_ended() {
    let history = History::open("history-pages").await;
    for (hours_ago, number) in [(5, 1), (4, 2), (3, 3), (2, 4), (1, 1)] {
        let at_ms = NOW_UNIX_MS - hours_ago * HOUR_MS;
        history.read(book(number), at_ms, at_ms, 0).await;
    }

    let first = history.page(2, None).await.unwrap();
    let second = history.page(2, first.next.clone()).await.unwrap();
    let third = history.page(2, second.next.clone()).await.unwrap();

    let books = |page: &Page<HistoryEntry>| -> Vec<BookId> {
        page.items.iter().map(|entry| entry.book).collect()
    };
    assert_eq!(
        [books(&first), books(&second), books(&third)],
        [
            vec![book(1), book(4)],
            vec![book(3), book(2)],
            vec![book(1)]
        ]
    );
    assert_eq!(third.next, None);
}

#[tokio::test]
async fn pages_through_sessions_started_at_the_same_moment() {
    let history = History::open("history-same-moment").await;
    let at_ms = NOW_UNIX_MS - HOUR_MS;
    for number in [1, 2, 3, 4] {
        history.read(book(number), at_ms, at_ms, 0).await;
    }

    let first = history.page(2, None).await.unwrap();
    let second = history.page(2, first.next.clone()).await.unwrap();

    let books = |page: &Page<HistoryEntry>| -> Vec<BookId> {
        page.items.iter().map(|entry| entry.book).collect()
    };
    assert_eq!(
        [books(&first), books(&second)],
        [vec![book(4), book(3)], vec![book(2), book(1)]]
    );
}

#[tokio::test]
async fn shows_how_far_each_book_has_been_read_since() {
    let history = History::open("history-reading").await;
    history
        .read(book(3), NOW_UNIX_MS - HOUR_MS, NOW_UNIX_MS - HOUR_MS, 4)
        .await;
    history.mark_read(book(3)).await;

    let page = history.page(50, None).await.unwrap();

    assert_eq!(
        page.items.first().map(|entry| entry.reading),
        Some(BookReading::Read {
            position_page: None
        })
    );
}

#[tokio::test]
async fn leaves_out_the_sessions_of_books_no_longer_in_the_library() {
    let history = History::open("history-removed").await;
    history
        .read(
            book(1),
            NOW_UNIX_MS - 2 * HOUR_MS,
            NOW_UNIX_MS - 2 * HOUR_MS,
            0,
        )
        .await;
    history
        .read(book(4), NOW_UNIX_MS - HOUR_MS, NOW_UNIX_MS - HOUR_MS, 0)
        .await;
    let root = history.root;
    let gone = location_of(SECOND_SERIES, 4);
    history
        .store
        .database()
        .write(move |transaction| {
            let held = remove_book_files(transaction, root, &[gone])?;
            remove_books_without_files(transaction, &held)
        })
        .await
        .unwrap();

    let listed = history.listed_books().await;

    assert_eq!(listed, [book(1)]);
}

#[tokio::test]
async fn refuses_a_cursor_another_list_gave_out() {
    let history = History::open("history-foreign-cursor").await;
    let foreign = "040000000000000001".parse().unwrap();

    let page = history.page(50, Some(foreign)).await;

    assert!(matches!(page, Err(Error::CursorForAnotherList)));
}

#[tokio::test]
async fn adds_up_the_time_read_on_each_local_day() {
    let history = History::open("history-days").await;
    let yesterday_ms = NOW_UNIX_MS - DAY_MS;
    history
        .read(book(1), yesterday_ms, yesterday_ms + 10 * MINUTE_MS, 0)
        .await;
    history
        .read(book(2), NOW_UNIX_MS, NOW_UNIX_MS + 5 * MINUTE_MS, 0)
        .await;
    history
        .read(
            book(4),
            NOW_UNIX_MS + 10 * MINUTE_MS,
            NOW_UNIX_MS + 17 * MINUTE_MS,
            0,
        )
        .await;

    let by_day = history.by_day(today() - 1..=today()).await;

    assert_eq!(
        by_day,
        BTreeMap::from([
            (today() - 1, ms(10 * MINUTE_MS)),
            (today(), ms(12 * MINUTE_MS)),
        ])
    );
}

#[tokio::test]
async fn adds_up_the_time_read_from_a_day_on() {
    let history = History::open("history-since").await;
    let three_days_ago_ms = NOW_UNIX_MS - 3 * DAY_MS;
    history
        .read(
            book(1),
            three_days_ago_ms,
            three_days_ago_ms + 30 * MINUTE_MS,
            0,
        )
        .await;
    history
        .read(
            book(2),
            NOW_UNIX_MS - DAY_MS,
            NOW_UNIX_MS - DAY_MS + 4 * MINUTE_MS,
            0,
        )
        .await;
    history
        .read(
            book(4),
            NOW_UNIX_MS - HOUR_MS,
            NOW_UNIX_MS - HOUR_MS + 6 * MINUTE_MS,
            0,
        )
        .await;

    let since = history.since(local_day_of(NOW_UNIX_MS - DAY_MS)).await;

    assert_eq!(since, ms(10 * MINUTE_MS));
}

#[tokio::test]
async fn reads_nothing_on_a_day_with_no_reading() {
    let history = History::open("history-nothing").await;

    let (by_day, since) = (
        history.by_day(today()..=today()).await,
        history.since(today()).await,
    );

    assert_eq!((by_day, since), (BTreeMap::new(), 0));
}
