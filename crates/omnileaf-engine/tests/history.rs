#![expect(
    clippy::unwrap_used,
    reason = "each test opens its own library in a scratch folder, so a failed set-up should stop the test"
)]

#[expect(
    dead_code,
    reason = "these tests read whole books but never write a book of loose pages or with details"
)]
mod books;
mod support;

use std::sync::{
    Arc,
    atomic::{AtomicU64, Ordering},
};

use books::write_book;
use omnileaf_engine::{
    BookId, BookReading, Clock, HistoryEntry, Library, LibraryListing, LocalDay, OpenedBook,
    ProbedFormat, ReadTo, ResourceRouter, SeriesBookListing, UtcOffset,
};
use support::{FixedClock, NOW_UNIX_MS, ScratchFolder};

const SOME_MONDAY: LocalDay = LocalDay(20_717);
const FOLDER: &str = "Sample Library";
const SERIES: &str = "Sample Series 01";
const PAGE_COUNT: u32 = 2;
const MINUTE_MS: u64 = 60_000;
const UTC_MINUS_FIVE: i16 = -300;

#[derive(Clone)]
struct SteppedClock(Arc<AtomicU64>);

impl SteppedClock {
    fn advance(&self, ms: u64) {
        self.0.fetch_add(ms, Ordering::Relaxed);
    }
}

impl Clock for SteppedClock {
    fn now_unix_ms(&self) -> u64 {
        self.0.load(Ordering::Relaxed)
    }
}

struct Shelf {
    library: Library,
    router: ResourceRouter,
    clock: SteppedClock,
    _home: ScratchFolder,
    _comics: ScratchFolder,
    _cache: ScratchFolder,
}

impl Shelf {
    async fn with_two_books(name: &str) -> Self {
        let comics = ScratchFolder::new(&format!("{name}-comics"));
        let series = comics.path().join(FOLDER).join(SERIES);
        write_book(&series.join(format!("{SERIES} v01.cbz")), 61);
        write_book(&series.join(format!("{SERIES} v02.cbz")), 62);
        let home = ScratchFolder::new(&format!("{name}-home"));
        let clock = SteppedClock(Arc::new(AtomicU64::new(NOW_UNIX_MS)));
        let library = Library::open(home.path().to_path_buf(), clock.clone())
            .await
            .unwrap();
        library
            .add_folder(comics.path().join(FOLDER), |_| {})
            .await
            .unwrap();
        let cache = ScratchFolder::new(&format!("{name}-cache"));
        let router = ResourceRouter::open(cache.path()).unwrap();
        Self {
            library,
            router,
            clock,
            _home: home,
            _comics: comics,
            _cache: cache,
        }
    }

    async fn book(&self, index: usize) -> BookId {
        let listed = self
            .library
            .series(LibraryListing::default(), None)
            .await
            .unwrap();
        let series = listed.series.first().unwrap().id;
        let books = self
            .library
            .series_books(series, SeriesBookListing::default(), None)
            .await
            .unwrap();
        books.books.get(index).unwrap().id
    }

    async fn open(&self, index: usize) -> OpenedBook {
        let book = self.book(index).await;
        self.router
            .open_book(&self.library, book, Vec::<ProbedFormat>::new())
            .await
            .unwrap()
    }

    async fn restore_in(&self, index: usize, offset: UtcOffset) -> OpenedBook {
        let opened = self.open(index).await;
        self.library
            .reading_restored(opened.id, opened.start_page, offset)
            .await
            .unwrap();
        opened
    }

    async fn restore(&self, index: usize) -> OpenedBook {
        self.restore_in(index, UtcOffset::UTC).await
    }

    async fn show(&self, opened: &OpenedBook, page: u32) {
        self.library.page_shown(opened.id, page).await.unwrap();
    }

    async fn close(&self, opened: &OpenedBook) {
        self.library.close_book(opened.id).await.unwrap();
    }

    async fn entries(&self) -> Vec<HistoryEntry> {
        self.library.history(None).await.unwrap().entries
    }
}

async fn empty_library(name: &str) -> (Library, ScratchFolder) {
    let home = ScratchFolder::new(name);
    let library = Library::open(home.path().to_path_buf(), FixedClock)
        .await
        .unwrap();
    (library, home)
}

#[tokio::test]
async fn lists_no_history_before_anything_is_read() {
    let (library, _home) = empty_library("history-empty").await;

    let page = library.history(None).await.unwrap();

    assert_eq!((page.entries, page.next), (Vec::new(), None));
}

#[tokio::test]
async fn counts_no_time_read_before_anything_is_read() {
    let (library, _home) = empty_library("history-no-time").await;

    let read_seconds = library.reading_time_since(SOME_MONDAY).await.unwrap();

    assert_eq!(read_seconds, 0);
}

#[tokio::test]
async fn lists_a_book_read_from_the_page_restored_until_it_closes() {
    let shelf = Shelf::with_two_books("history-read").await;
    let opened = shelf.restore(0).await;
    shelf.clock.advance(3 * MINUTE_MS / 2);

    shelf.close(&opened).await;

    let entries = shelf.entries().await;
    let entry = entries.first().unwrap();
    assert_eq!(entries.len(), 1);
    assert_eq!(entry.book, opened.id);
    assert_eq!(entry.book_title, "Sample Series 01 v01");
    assert_eq!(entry.series_title, SERIES);
    assert_eq!(entry.started_at_ms, i64::try_from(NOW_UNIX_MS).unwrap());
    assert_eq!(entry.read_seconds, 90);
    assert_eq!(
        entry.read_to,
        ReadTo::Page {
            page: 1,
            page_count: PAGE_COUNT
        }
    );
    assert_eq!(entry.day.read_seconds, 90);
}

#[tokio::test]
async fn lists_a_book_read_with_its_series_and_place_in_it() {
    let shelf = Shelf::with_two_books("history-place").await;
    let opened = shelf.restore(1).await;

    shelf.close(&opened).await;

    let entry = shelf.entries().await.into_iter().next().unwrap();
    assert_eq!((entry.series, entry.position), (opened.series, 2));
}

#[tokio::test]
async fn lists_nothing_for_a_book_opened_but_never_restored() {
    let shelf = Shelf::with_two_books("history-not-restored").await;
    let opened = shelf.open(0).await;

    shelf.close(&opened).await;

    assert_eq!(shelf.entries().await, []);
}

#[tokio::test]
async fn lists_a_book_read_to_its_end_as_read() {
    let shelf = Shelf::with_two_books("history-finished").await;
    let opened = shelf.restore(0).await;
    shelf.clock.advance(MINUTE_MS);
    shelf.show(&opened, PAGE_COUNT - 1).await;

    shelf.close(&opened).await;

    let entry = shelf.entries().await.into_iter().next().unwrap();
    assert_eq!(
        (entry.read_to, entry.reading, entry.read_seconds),
        (ReadTo::End, BookReading::Read, 60)
    );
}

#[tokio::test]
async fn keeps_the_local_time_the_book_was_read_at() {
    let shelf = Shelf::with_two_books("history-zone").await;
    let utc_minus_five = UtcOffset::try_from(UTC_MINUS_FIVE).unwrap();

    let opened = shelf.restore_in(0, utc_minus_five).await;
    shelf.close(&opened).await;

    let entry = shelf.entries().await.into_iter().next().unwrap();
    assert_eq!(entry.utc_offset_minutes, utc_minus_five);
    assert_eq!(entry.day.day, SOME_MONDAY);
}

#[tokio::test]
async fn carries_on_the_entry_of_a_book_opened_again_within_two_minutes() {
    let shelf = Shelf::with_two_books("history-reopened").await;
    let first = shelf.restore(0).await;
    shelf.clock.advance(MINUTE_MS);
    shelf.close(&first).await;
    shelf.clock.advance(MINUTE_MS);

    let again = shelf.restore(0).await;
    shelf.clock.advance(MINUTE_MS);
    shelf.close(&again).await;

    let entries = shelf.entries().await;
    assert_eq!(
        entries
            .iter()
            .map(|entry| entry.read_seconds)
            .collect::<Vec<_>>(),
        [180]
    );
}

#[tokio::test]
async fn lists_each_book_read_the_latest_first() {
    let shelf = Shelf::with_two_books("history-two-books").await;
    let first = shelf.restore(0).await;
    shelf.close(&first).await;
    shelf.clock.advance(MINUTE_MS);

    let second = shelf.restore(1).await;
    shelf.close(&second).await;

    let books: Vec<BookId> = shelf
        .entries()
        .await
        .iter()
        .map(|entry| entry.book)
        .collect();
    assert_eq!(books, [second.id, first.id]);
}

#[tokio::test]
async fn counts_the_time_read_since_a_day() {
    let shelf = Shelf::with_two_books("history-since").await;
    let opened = shelf.restore(0).await;
    shelf.clock.advance(2 * MINUTE_MS);
    shelf.close(&opened).await;

    let read_seconds = shelf.library.reading_time_since(SOME_MONDAY).await.unwrap();

    assert_eq!(read_seconds, 120);
}

#[tokio::test]
async fn lists_one_entry_for_a_page_read_for_longer_than_two_minutes() {
    let shelf = Shelf::with_two_books("history-long-page").await;
    let opened = shelf.restore(0).await;
    shelf.clock.advance(3 * MINUTE_MS);
    shelf.show(&opened, 1).await;

    shelf.close(&opened).await;

    let read: Vec<u32> = shelf
        .entries()
        .await
        .iter()
        .map(|entry| entry.read_seconds)
        .collect();
    assert_eq!(read, [180]);
}

#[tokio::test]
async fn counts_the_time_on_the_last_page_until_the_book_closes() {
    let shelf = Shelf::with_two_books("history-long-last-page").await;
    let opened = shelf.restore(0).await;
    shelf.clock.advance(3 * MINUTE_MS);

    shelf.close(&opened).await;

    let read: Vec<u32> = shelf
        .entries()
        .await
        .iter()
        .map(|entry| entry.read_seconds)
        .collect();
    assert_eq!(read, [180]);
}

#[tokio::test]
async fn counts_no_time_the_app_spent_put_away() {
    let shelf = Shelf::with_two_books("history-put-away").await;
    let opened = shelf.restore(0).await;
    shelf.clock.advance(MINUTE_MS);
    shelf.library.save_reading().await.unwrap();
    shelf.clock.advance(3 * MINUTE_MS);

    shelf.close(&opened).await;

    let read: Vec<u32> = shelf
        .entries()
        .await
        .iter()
        .map(|entry| entry.read_seconds)
        .collect();
    assert_eq!(read, [60]);
}

#[tokio::test]
async fn lists_a_new_entry_for_reading_on_long_after_the_app_was_put_away() {
    let shelf = Shelf::with_two_books("history-back-from-away").await;
    let opened = shelf.restore(0).await;
    shelf.clock.advance(MINUTE_MS);
    shelf.library.save_reading().await.unwrap();
    shelf.clock.advance(3 * MINUTE_MS);
    shelf.show(&opened, 1).await;
    shelf.library.save_reading().await.unwrap();
    shelf.clock.advance(MINUTE_MS);

    shelf.close(&opened).await;

    let read: Vec<u32> = shelf
        .entries()
        .await
        .iter()
        .map(|entry| entry.read_seconds)
        .collect();
    assert_eq!(read, [60, 60]);
}
