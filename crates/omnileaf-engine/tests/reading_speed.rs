#![expect(
    clippy::unwrap_used,
    reason = "each test opens its own library in a scratch folder, so a failed set-up should stop the test"
)]

#[expect(
    dead_code,
    reason = "these tests need scratch folders but none of the files support can put in them"
)]
mod support;

use std::{
    fs,
    path::Path,
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
};

use omnileaf_engine::{
    Clock, Library, LibraryListing, OpenedBook, ProbedFormat, ResourceRouter, SeriesBookListing,
    SeriesId, UtcOffset,
};
use omnileaf_testkit::{ArchiveEntry, Compression, PageShape, cbz, page_jpeg};
use support::{NOW_UNIX_MS, ScratchFolder};

const PAGES: u32 = 30;
const FOLDER: &str = "Sample Library";
const SERIES: &str = "Sample Series 01";
const SECOND_MS: u64 = 1_000;
const BREAK_MS: u64 = 10 * 60 * SECOND_MS;

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
    async fn with_a_book(name: &str) -> Self {
        let comics = ScratchFolder::new(&format!("{name}-comics"));
        write_book(
            &comics
                .path()
                .join(FOLDER)
                .join(SERIES)
                .join(format!("{SERIES} v01.cbz")),
        );
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

    async fn series(&self) -> SeriesId {
        let listed = self
            .library
            .series(LibraryListing::default(), None)
            .await
            .unwrap();
        listed.series.first().unwrap().id
    }

    async fn seconds_left(&self) -> Option<u32> {
        let series = self.series().await;
        self.library
            .series_overview(series)
            .await
            .unwrap()
            .seconds_left
    }

    async fn open(&self) -> OpenedBook {
        let series = self.series().await;
        let books = self
            .library
            .series_books(series, SeriesBookListing::default(), None)
            .await
            .unwrap();
        let book = books.books.first().unwrap().id;
        self.router
            .open_book(&self.library, book, Vec::<ProbedFormat>::new())
            .await
            .unwrap()
    }

    async fn read_on(&self, pages: u32, seconds_a_page: u64) {
        let opened = self.open().await;
        self.library
            .reading_restored(opened.id, opened.start_page, UtcOffset::UTC)
            .await
            .unwrap();
        for page in opened.start_page + 1..=opened.start_page + pages {
            self.clock.advance(seconds_a_page * SECOND_MS);
            self.library
                .page_shown(opened.id, page, UtcOffset::UTC)
                .await
                .unwrap();
        }
        self.library.close_book(opened.id).await.unwrap();
        self.clock.advance(BREAK_MS);
    }
}

fn write_book(path: &Path) {
    let entries: Vec<ArchiveEntry> = (0..PAGES)
        .map(|index| ArchiveEntry {
            name: format!("{:03}.jpg", index + 1),
            bytes: page_jpeg(7, index, PageShape::Portrait).unwrap(),
        })
        .collect();
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, cbz(&entries, Compression::Stored).unwrap()).unwrap();
}

#[tokio::test]
async fn opens_a_book_knowing_no_reading_speed_before_reading_was_timed() {
    let shelf = Shelf::with_a_book("speed-untimed").await;

    let opened = shelf.open().await;

    assert_eq!(opened.seconds_per_page, None);
}

#[tokio::test]
async fn opens_a_book_with_the_time_a_page_took_in_the_reading_before() {
    let shelf = Shelf::with_a_book("speed-learned").await;
    shelf.read_on(5, 10).await;
    shelf.read_on(5, 20).await;
    shelf.read_on(5, 12).await;

    let opened = shelf.open().await;

    assert_eq!(opened.seconds_per_page, Some(12));
}

#[tokio::test]
async fn opens_a_book_knowing_no_reading_speed_while_learning_it_is_off() {
    let shelf = Shelf::with_a_book("speed-off").await;
    shelf.read_on(5, 10).await;
    shelf.library.set_learns_reading_speed(false);
    shelf.read_on(5, 20).await;
    shelf.read_on(5, 12).await;

    let opened = shelf.open().await;

    assert_eq!(opened.seconds_per_page, None);
}

#[tokio::test]
async fn opens_a_book_with_the_speed_learned_once_learning_it_is_back_on() {
    let shelf = Shelf::with_a_book("speed-back-on").await;
    shelf.library.set_learns_reading_speed(false);
    shelf.read_on(5, 10).await;
    shelf.read_on(5, 20).await;
    shelf.read_on(5, 12).await;
    shelf.library.set_learns_reading_speed(true);

    let opened = shelf.open().await;

    assert_eq!(opened.seconds_per_page, Some(12));
}

#[tokio::test]
async fn knows_no_time_left_in_a_series_while_learning_the_reading_speed_is_off() {
    let shelf = Shelf::with_a_book("time-left-off").await;
    shelf.read_on(5, 10).await;
    shelf.read_on(5, 20).await;
    shelf.read_on(5, 12).await;
    shelf.library.set_learns_reading_speed(false);

    let seconds_left = shelf.seconds_left().await;

    assert_eq!(seconds_left, None);
}

#[tokio::test]
async fn knows_no_time_left_in_a_series_before_reading_was_timed() {
    let shelf = Shelf::with_a_book("time-left-untimed").await;

    assert_eq!(shelf.seconds_left().await, None);
}

#[tokio::test]
async fn times_the_pages_left_in_a_series_at_the_speed_learned() {
    let shelf = Shelf::with_a_book("time-left-learned").await;
    shelf.read_on(5, 10).await;
    shelf.read_on(5, 20).await;
    shelf.read_on(5, 12).await;

    let seconds_left = shelf.seconds_left().await;

    assert_eq!(seconds_left, Some((PAGES - 15) * 12));
}
