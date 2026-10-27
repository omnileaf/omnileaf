#![expect(
    clippy::unwrap_used,
    reason = "each test opens its own library in scratch folders, so a failed set-up should stop the test"
)]

#[expect(
    dead_code,
    reason = "these tests write whole books, never loose pages or books with details"
)]
mod books;
mod stepped_clock;
#[expect(
    dead_code,
    reason = "these tests move a clock of their own rather than read the fixed one"
)]
mod support;

use std::time::Duration;

use books::write_book;
use omnileaf_engine::{
    Library, LibraryListing, ProbedFormat, ResourceRouter, SeriesBookListing, SeriesId,
    SmartFilter, UtcOffset,
};
use stepped_clock::SteppedClock;
use support::ScratchFolder;

const FOLDER: &str = "Sample Library";
const READ: &str = "Sample Series 01";
const UNREAD: &str = "Sample Series 02";
const READ_SEED: u64 = 1;
const UNREAD_SEED: u64 = 2;
const DAY: Duration = Duration::from_hours(24);

struct Shelf {
    library: Library,
    router: ResourceRouter,
    clock: SteppedClock,
    _home: ScratchFolder,
    _comics: ScratchFolder,
    _cache: ScratchFolder,
}

impl Shelf {
    async fn with_two_series(name: &str) -> Self {
        let comics = ScratchFolder::new(&format!("{name}-comics"));
        for (series, seed) in [(READ, READ_SEED), (UNREAD, UNREAD_SEED)] {
            let folder = comics.path().join(FOLDER).join(series);
            write_book(&folder.join(format!("{series} v01.cbz")), seed);
        }
        let home = ScratchFolder::new(&format!("{name}-home"));
        let clock = SteppedClock::new();
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

    async fn series_titled(&self, title: &str) -> SeriesId {
        let page = self
            .library
            .series(LibraryListing::default(), None)
            .await
            .unwrap();
        page.series
            .into_iter()
            .find(|series| series.title == title)
            .unwrap()
            .id
    }

    async fn read(&self, title: &str) {
        let series = self.series_titled(title).await;
        let books = self
            .library
            .series_books(series, SeriesBookListing::default(), None)
            .await
            .unwrap();
        let book = books.books.first().unwrap().id;
        let opened = self
            .router
            .open_book(&self.library, book, Vec::<ProbedFormat>::new())
            .await
            .unwrap();
        self.library
            .reading_restored(opened.id, opened.start_page, UtcOffset::UTC)
            .await
            .unwrap();
        self.library.close_book(opened.id).await.unwrap();
    }

    async fn listed(&self, smart: SmartFilter) -> (Vec<String>, u32) {
        let mut listing = LibraryListing::default();
        listing.filter.smart = vec![smart];
        let page = self.library.series(listing.clone(), None).await.unwrap();
        let count = self.library.series_count(listing.filter).await.unwrap();
        let titles = page.series.into_iter().map(|series| series.title).collect();
        (titles, count)
    }
}

#[tokio::test]
async fn lists_and_counts_a_series_as_forgotten_once_three_months_pass_since_it_was_read() {
    let shelf = Shelf::with_two_series("forgotten-after-three-months").await;
    shelf.read(READ).await;

    shelf.clock.advance(91 * DAY);

    assert_eq!(
        shelf.listed(SmartFilter::Forgotten).await,
        (vec![READ.to_owned()], 1)
    );
}

#[tokio::test]
async fn keeps_a_series_read_within_three_months_out_of_forgotten() {
    let shelf = Shelf::with_two_series("forgotten-within-three-months").await;
    shelf.read(READ).await;

    shelf.clock.advance(89 * DAY);

    assert_eq!(shelf.listed(SmartFilter::Forgotten).await, (Vec::new(), 0));
}

#[tokio::test]
async fn lists_and_counts_a_series_whose_book_has_a_renamed_copy_in_another_folder() {
    let shelf = Shelf::with_two_series("duplicates-in-another-folder").await;
    let backup = ScratchFolder::new("duplicates-in-another-folder-backup");
    write_book(
        &backup.path().join(READ).join("Renamed copy.cbz"),
        READ_SEED,
    );

    shelf
        .library
        .add_folder(backup.path().to_path_buf(), |_| {})
        .await
        .unwrap();

    assert_eq!(
        shelf.listed(SmartFilter::Duplicates).await,
        (vec![READ.to_owned()], 1)
    );
}
