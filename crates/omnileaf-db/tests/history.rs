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
    history::{
        BookSessions, HistoryEntry, HistoryOf, ReadingSince, book_reading_time, book_sessions,
        clear_history, days_in_a_row, hide_book_from_history, history_page, reading_since,
        reading_time_by_day, restore_book_to_history, restore_history, series_read,
    },
    store::{Continuity, SessionPlace, Store},
};
use omnileaf_sync_proto::{BookId, Fingerprint, ImageEntry, SeriesId};
use store_support::{FakeClock, NOW_UNIX_MS, book, open_store, set_position};
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
const UTC_MINUS_FIVE: i16 = -300;
const LAST_PAGE: u32 = PAGE_COUNT - 1;

fn local_day_of(at_ms: u64) -> i64 {
    (ms(at_ms) + i64::from(UTC_PLUS_TEN) * ms(MINUTE_MS)).div_euclid(ms(DAY_MS))
}

fn today() -> i64 {
    local_day_of(NOW_UNIX_MS)
}

fn start_of_today_ms() -> u64 {
    u64::try_from(today() * ms(DAY_MS) - i64::from(UTC_PLUS_TEN) * ms(MINUTE_MS)).unwrap()
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
        self.read_in(UTC_PLUS_TEN, book, (from_ms, to_ms), page)
            .await;
    }

    async fn read_in(
        &self,
        utc_offset_minutes: i16,
        book: BookId,
        (from_ms, to_ms): (u64, u64),
        page: u32,
    ) {
        let place = SessionPlace {
            book,
            page,
            page_count: PAGE_COUNT,
            utc_offset_minutes,
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
        self.page_of(HistoryOf::Everything, size, after).await
    }

    async fn page_of(
        &self,
        of: HistoryOf,
        size: u16,
        after: Option<Cursor>,
    ) -> Result<Page<HistoryEntry>, Error> {
        let request = PageRequest {
            after: after.map(|cursor| cursor.to_string().parse().unwrap()),
            size: PageSize::try_from(size).unwrap(),
        };
        self.store
            .database()
            .read(move |connection| history_page(connection, &of, &request))
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

    async fn spent_on(&self, book: BookId) -> i64 {
        self.store
            .database()
            .read(move |connection| book_reading_time(connection, book))
            .await
            .unwrap()
    }

    async fn since(&self, first_day: i64) -> ReadingSince {
        self.store
            .database()
            .read(move |connection| reading_since(connection, first_day))
            .await
            .unwrap()
    }

    async fn days_in_a_row(&self) -> u32 {
        self.store
            .database()
            .read(move |connection| days_in_a_row(connection, today()))
            .await
            .unwrap()
    }

    async fn books_read(&self, matching: &str) -> Vec<BookId> {
        let of = HistoryOf::Books {
            matching: matching.to_owned(),
        };
        self.page_of(of, 50, None)
            .await
            .unwrap()
            .items
            .iter()
            .map(|entry| entry.book)
            .collect()
    }

    async fn hide(&self, book: BookId, at_ms: u64) -> Option<i64> {
        self.store
            .database()
            .write(move |transaction| hide_book_from_history(transaction, book, ms(at_ms)))
            .await
            .unwrap()
    }

    async fn restore(&self, book: BookId, mark: Option<i64>) {
        self.store
            .database()
            .write(move |transaction| restore_book_to_history(transaction, book, mark))
            .await
            .unwrap();
    }

    async fn clear(&self, at_ms: u64) -> Option<i64> {
        self.store
            .database()
            .write(move |transaction| clear_history(transaction, ms(at_ms)))
            .await
            .unwrap()
    }

    async fn restore_cleared(&self, mark: Option<i64>) {
        self.store
            .database()
            .write(move |transaction| restore_history(transaction, mark))
            .await
            .unwrap();
    }

    async fn read_days_ago(&self, number: u32, days_ago: u64) {
        let at_ms = NOW_UNIX_MS - days_ago * DAY_MS;
        self.read(book(number), at_ms, at_ms + MINUTE_MS, 0).await;
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

    assert_eq!(since.read_ms, ms(10 * MINUTE_MS));
}

#[tokio::test]
async fn reads_nothing_on_a_day_with_no_reading() {
    let history = History::open("history-nothing").await;

    let (by_day, since) = (
        history.by_day(today()..=today()).await,
        history.since(today()).await,
    );

    assert_eq!((by_day, since), (BTreeMap::new(), ReadingSince::default()));
}

#[tokio::test]
async fn adds_up_the_time_spent_reading_one_book_over_its_sessions() {
    let history = History::open("history-book-time").await;
    let earlier_ms = NOW_UNIX_MS - DAY_MS;
    history
        .read(book(2), earlier_ms, earlier_ms + 20 * MINUTE_MS, 7)
        .await;
    history
        .read(
            book(3),
            NOW_UNIX_MS - HOUR_MS,
            NOW_UNIX_MS - 50 * MINUTE_MS,
            0,
        )
        .await;
    history
        .read(book(2), NOW_UNIX_MS - 30 * MINUTE_MS, NOW_UNIX_MS, 23)
        .await;

    let spent = [
        history.spent_on(book(2)).await,
        history.spent_on(book(1)).await,
    ];

    assert_eq!(spent, [ms(50 * MINUTE_MS), 0]);
}

#[tokio::test]
async fn counts_the_books_opened_and_finished_from_a_day_on() {
    let history = History::open("history-books-since").await;
    let three_days_ago_ms = NOW_UNIX_MS - 3 * DAY_MS;
    let yesterday_ms = NOW_UNIX_MS - DAY_MS;
    history
        .read(book(1), three_days_ago_ms, three_days_ago_ms, LAST_PAGE)
        .await;
    history.read(book(2), yesterday_ms, yesterday_ms, 5).await;
    history
        .read(
            book(2),
            NOW_UNIX_MS - HOUR_MS,
            NOW_UNIX_MS - HOUR_MS,
            LAST_PAGE,
        )
        .await;
    history.read(book(3), NOW_UNIX_MS, NOW_UNIX_MS, 3).await;
    history
        .read(
            book(4),
            NOW_UNIX_MS + HOUR_MS,
            NOW_UNIX_MS + HOUR_MS,
            LAST_PAGE,
        )
        .await;

    let since = history.since(local_day_of(yesterday_ms)).await;

    assert_eq!((since.books_opened, since.books_finished), (3, 2));
}

#[tokio::test]
async fn counts_the_days_read_in_a_row_up_to_today() {
    let history = History::open("history-streak").await;
    for (number, days_ago) in [(1, 0), (2, 1), (3, 1), (4, 2), (1, 4)] {
        history.read_days_ago(number, days_ago).await;
    }

    let streak = history.days_in_a_row().await;

    assert_eq!(streak, 3);
}

#[tokio::test]
async fn keeps_the_days_in_a_row_until_today_ends_without_reading() {
    let history = History::open("history-streak-yesterday").await;
    for (number, days_ago) in [(1, 1), (2, 2)] {
        history.read_days_ago(number, days_ago).await;
    }

    let streak = history.days_in_a_row().await;

    assert_eq!(streak, 2);
}

#[tokio::test]
async fn counts_no_days_in_a_row_once_a_whole_day_goes_unread() {
    let history = History::open("history-streak-broken").await;
    for (number, days_ago) in [(1, 2), (2, 3)] {
        history.read_days_ago(number, days_ago).await;
    }

    let streak = history.days_in_a_row().await;

    assert_eq!(streak, 0);
}

#[tokio::test]
async fn counts_a_session_read_across_midnight_on_the_day_it_began() {
    let history = History::open("history-streak-midnight").await;
    let midnight_ms = start_of_today_ms();
    history
        .read(
            book(1),
            midnight_ms - 10 * MINUTE_MS,
            midnight_ms + 20 * MINUTE_MS,
            0,
        )
        .await;
    history.read_days_ago(2, 3).await;

    let streak = history.days_in_a_row().await;

    assert_eq!(streak, 1);
}

#[tokio::test]
async fn counts_each_session_on_the_local_day_of_the_time_zone_it_was_read_in() {
    let history = History::open("history-streak-zones").await;
    let this_morning_ms = start_of_today_ms() + HOUR_MS;
    history
        .read_in(UTC_PLUS_TEN, book(1), (this_morning_ms, this_morning_ms), 0)
        .await;
    let two_hours_earlier_ms = this_morning_ms - 2 * HOUR_MS;
    history
        .read_in(
            UTC_MINUS_FIVE,
            book(2),
            (two_hours_earlier_ms, two_hours_earlier_ms),
            0,
        )
        .await;
    history.read_days_ago(3, 2).await;

    let streak = history.days_in_a_row().await;

    assert_eq!(streak, 3);
}

async fn read_hours_ago(history: &History, number: u32, hours_ago: u64) {
    let at_ms = NOW_UNIX_MS - hours_ago * HOUR_MS;
    history.read(book(number), at_ms, at_ms, 0).await;
}

fn books_of(page: &Page<HistoryEntry>) -> Vec<BookId> {
    page.items.iter().map(|entry| entry.book).collect()
}

#[tokio::test]
async fn pages_through_the_sessions_of_one_series_the_latest_first() {
    let history = History::open("history-of-series").await;
    for (number, hours_ago) in [(1, 6), (4, 5), (2, 4), (4, 3), (3, 2), (1, 1)] {
        read_hours_ago(&history, number, hours_ago).await;
    }
    let first_series = HistoryOf::Series(SeriesId::local(FIRST_SERIES).unwrap());

    let first = history
        .page_of(first_series.clone(), 2, None)
        .await
        .unwrap();
    let second = history
        .page_of(first_series, 2, first.next.clone())
        .await
        .unwrap();

    assert_eq!(
        [books_of(&first), books_of(&second)],
        [vec![book(1), book(3)], vec![book(2), book(1)]]
    );
    assert_eq!(second.next, None);
}

#[tokio::test]
async fn pages_through_the_sessions_of_one_book_the_latest_first() {
    let history = History::open("history-of-book").await;
    for (number, hours_ago) in [(2, 5), (1, 4), (2, 3), (2, 2), (3, 1)] {
        read_hours_ago(&history, number, hours_ago).await;
    }

    let first = history
        .page_of(HistoryOf::Book(book(2)), 2, None)
        .await
        .unwrap();
    let second = history
        .page_of(HistoryOf::Book(book(2)), 2, first.next.clone())
        .await
        .unwrap();

    let started: Vec<i64> = [&first, &second]
        .iter()
        .flat_map(|page| page.items.iter())
        .map(|entry| entry.started_at_ms)
        .collect();
    assert_eq!(
        started,
        [2, 3, 5].map(|hours_ago| ms(NOW_UNIX_MS - hours_ago * HOUR_MS))
    );
    assert_eq!(books_of(&second), [book(2)]);
}

#[tokio::test]
async fn adds_up_a_book_s_sessions_with_the_days_it_was_first_and_last_read() {
    let history = History::open("history-book-sessions").await;
    let three_days_ago_ms = NOW_UNIX_MS - 3 * DAY_MS;
    history
        .read(
            book(2),
            three_days_ago_ms,
            three_days_ago_ms + 20 * MINUTE_MS,
            7,
        )
        .await;
    history
        .read(book(2), NOW_UNIX_MS, NOW_UNIX_MS + 5 * MINUTE_MS, 9)
        .await;
    history.read_days_ago(3, 1).await;

    let sessions = [book(2), book(1)].map(|read| {
        history
            .store
            .database()
            .read(move |connection| book_sessions(connection, read))
    });
    let [read, unread] = sessions;

    assert_eq!(
        (read.await.unwrap(), unread.await.unwrap()),
        (
            Some(BookSessions {
                sessions: 2,
                read_ms: ms(25 * MINUTE_MS),
                first_day: today() - 3,
                last_day: today(),
            }),
            None
        )
    );
}

#[tokio::test]
async fn names_the_series_read_in_title_order() {
    let history = History::open("history-series-read").await;
    history.shelve("Sample Series 00", 5).await;
    history.read_days_ago(4, 2).await;
    history.read_days_ago(2, 1).await;
    history.read_days_ago(3, 0).await;

    let series = history.store.database().read(series_read).await.unwrap();

    assert_eq!(
        series,
        [
            (
                SeriesId::local(FIRST_SERIES).unwrap(),
                FIRST_SERIES.to_owned()
            ),
            (
                SeriesId::local(SECOND_SERIES).unwrap(),
                SECOND_SERIES.to_owned()
            ),
        ]
    );
}

#[tokio::test]
async fn pages_through_the_latest_session_of_each_book_started_and_not_finished() {
    let history = History::open("history-unfinished").await;
    for (number, hours_ago) in [(1, 5), (2, 4), (1, 3), (3, 2), (4, 1)] {
        read_hours_ago(&history, number, hours_ago).await;
    }
    for number in [1, 2, 3] {
        set_position(&history.store, book(number), 2).await.unwrap();
    }
    history.mark_read(book(3)).await;

    let first = history
        .page_of(HistoryOf::Unfinished, 1, None)
        .await
        .unwrap();
    let second = history
        .page_of(HistoryOf::Unfinished, 1, first.next.clone())
        .await
        .unwrap();

    assert_eq!(
        [books_of(&first), books_of(&second)],
        [vec![book(1)], vec![book(2)]]
    );
    assert_eq!(
        first.items.first().map(|entry| entry.started_at_ms),
        Some(ms(NOW_UNIX_MS - 3 * HOUR_MS))
    );
    assert_eq!(second.next, None);
}

#[tokio::test]
async fn lists_each_book_read_once_at_its_latest_session_newest_first() {
    let history = History::open("history-books").await;
    history
        .read(
            book(1),
            NOW_UNIX_MS - 3 * HOUR_MS,
            NOW_UNIX_MS - 3 * HOUR_MS,
            0,
        )
        .await;
    history
        .read(
            book(4),
            NOW_UNIX_MS - 2 * HOUR_MS,
            NOW_UNIX_MS - 2 * HOUR_MS,
            0,
        )
        .await;
    history
        .read(book(1), NOW_UNIX_MS - HOUR_MS, NOW_UNIX_MS - HOUR_MS, 4)
        .await;

    assert_eq!(history.books_read("").await, [book(1), book(4)]);
}

#[tokio::test]
async fn leaves_out_a_book_removed_from_history_until_it_is_read_again() {
    let history = History::open("history-books-removed").await;
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

    history.hide(book(1), NOW_UNIX_MS).await;
    let removed = history.books_read("").await;
    history
        .read(book(1), NOW_UNIX_MS + MINUTE_MS, NOW_UNIX_MS + MINUTE_MS, 0)
        .await;

    assert_eq!(
        (removed, history.books_read("").await),
        (vec![book(4)], vec![book(1), book(4)])
    );
}

#[tokio::test]
async fn puts_a_book_removed_from_history_back_on_undo() {
    let history = History::open("history-books-undo").await;
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

    let mark = history.hide(book(1), NOW_UNIX_MS).await;
    history.restore(book(1), mark).await;

    assert_eq!(history.books_read("").await, [book(4), book(1)]);
}

#[tokio::test]
async fn leaves_out_all_read_before_history_was_cleared_and_puts_it_back_on_undo() {
    let history = History::open("history-books-cleared").await;
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

    let mark = history.clear(NOW_UNIX_MS).await;
    let cleared = history.books_read("").await;
    history
        .read(book(2), NOW_UNIX_MS + MINUTE_MS, NOW_UNIX_MS + MINUTE_MS, 0)
        .await;
    let after_clearing = history.books_read("").await;
    history.restore_cleared(mark).await;

    assert_eq!(
        (cleared, after_clearing, history.books_read("").await),
        (Vec::new(), vec![book(2)], vec![book(2), book(4), book(1)])
    );
}

#[tokio::test]
async fn finds_the_books_read_by_series_or_book_title() {
    let history = History::open("history-books-found").await;
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

    assert_eq!(
        [
            history.books_read("series 02").await,
            history.books_read("V01").await,
            history.books_read("sample").await,
        ],
        [vec![book(4)], vec![book(1)], vec![book(4), book(1)]]
    );
}

#[tokio::test]
async fn keeps_every_session_in_the_other_lists_though_a_book_is_removed_from_history() {
    let history = History::open("history-books-sessions-kept").await;
    history
        .read(book(1), NOW_UNIX_MS - HOUR_MS, NOW_UNIX_MS - HOUR_MS, 0)
        .await;

    history.hide(book(1), NOW_UNIX_MS).await;
    history.clear(NOW_UNIX_MS).await;

    assert_eq!(history.listed_books().await, [book(1)]);
}
