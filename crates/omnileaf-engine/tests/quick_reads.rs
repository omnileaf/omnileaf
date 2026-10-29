#![expect(
    clippy::unwrap_used,
    reason = "each test opens its own library in scratch folders, so a failed set-up should stop the test"
)]

mod stepped_clock;
#[expect(
    dead_code,
    reason = "these tests move a clock of their own rather than read the fixed one"
)]
mod support;

use std::{fs, path::Path, time::Duration};

use omnileaf_engine::{
    DetailEdits, Library, LibraryListing, OpenedBook, ProbedFormat, ResourceRouter,
    SeriesBookListing, SeriesId, SmartFilter, UtcOffset,
};
use omnileaf_testkit::{ArchiveEntry, Compression, PageShape, cbz, page_jpeg};
use stepped_clock::SteppedClock;
use support::ScratchFolder;

const FOLDER: &str = "Sample Library";
const PRACTICE: &str = "Practice Series";
const SHORT: &str = "Short Series";
const ADULT_SHORT: &str = "Adult Short Series";
const LONG: &str = "Long Series";
const SHORT_PAGES: u32 = 10;
const LONG_PAGES: u32 = 200;
const SECONDS_A_PAGE: u64 = 12;
const SLOWER_SECONDS_A_PAGE: u64 = 20;
const PRACTICE_SESSIONS: u32 = 3;
const PAGES_PER_PRACTICE_SESSION: u32 = 5;
const SESSIONS_TO_OUTWEIGH_THE_FIRST_PACE: u32 = 16;
const MORE_THAN_A_PAGE_OF_SERIES: u32 = 60;
const SERIES_PER_PAGE: usize = 50;
const BREAK: Duration = Duration::from_mins(10);
const FORGOTTEN_AFTER: Duration = Duration::from_hours(91 * 24);

struct Shelf {
    library: Library,
    router: ResourceRouter,
    clock: SteppedClock,
    _home: ScratchFolder,
    _comics: ScratchFolder,
    _cache: ScratchFolder,
}

impl Shelf {
    async fn with_series(name: &str, series: &[(&str, u32)]) -> Self {
        let comics = ScratchFolder::new(&format!("{name}-comics"));
        let practice = (PRACTICE, LONG_PAGES);
        for (seed, (title, pages)) in (1..).zip(series.iter().chain([&practice])) {
            let book = comics.path().join(FOLDER).join(title).join("v01.cbz");
            write_book(&book, seed, *pages);
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

    async fn with_a_short_and_a_long_series(name: &str) -> Self {
        Self::with_series(name, &[(SHORT, SHORT_PAGES), (LONG, LONG_PAGES)]).await
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

    async fn open(&self, title: &str) -> OpenedBook {
        let series = self.series_titled(title).await;
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

    async fn read_on(&self, title: &str, pages: u32, seconds_a_page: u64) {
        let opened = self.open(title).await;
        self.library
            .reading_restored(opened.id, opened.start_page, UtcOffset::UTC)
            .await
            .unwrap();
        for page in opened.start_page + 1..=opened.start_page + pages {
            self.clock.advance(Duration::from_secs(seconds_a_page));
            self.library
                .page_shown(opened.id, page, UtcOffset::UTC)
                .await
                .unwrap();
        }
        self.library.close_book(opened.id).await.unwrap();
        self.clock.advance(BREAK);
    }

    async fn learn_the_pace(&self, sessions: u32, seconds_a_page: u64) {
        for _ in 0..sessions {
            self.read_on(PRACTICE, PAGES_PER_PRACTICE_SESSION, seconds_a_page)
                .await;
        }
    }

    async fn learn_the_first_pace(&self) {
        self.learn_the_pace(PRACTICE_SESSIONS, SECONDS_A_PAGE).await;
    }

    async fn listed(&self, smart: &[SmartFilter]) -> (Vec<String>, u32) {
        let mut listing = LibraryListing::default();
        listing.filter.smart = smart.to_vec();
        let page = self.library.series(listing.clone(), None).await.unwrap();
        let count = self.library.series_count(listing.filter).await.unwrap();
        let titles = page.series.into_iter().map(|series| series.title).collect();
        (titles, count)
    }

    async fn quick_reads(&self) -> (Vec<String>, u32) {
        self.listed(&[SmartFilter::QuickReads]).await
    }

    async fn offers_quick_reads(&self) -> bool {
        self.library
            .filter_choices()
            .await
            .unwrap()
            .smart
            .contains(&SmartFilter::QuickReads)
    }
}

fn write_book(path: &Path, seed: u64, pages: u32) {
    let entries: Vec<ArchiveEntry> = (0..pages)
        .map(|index| ArchiveEntry {
            name: format!("{:03}.jpg", index + 1),
            bytes: page_jpeg(seed, index, PageShape::Portrait).unwrap(),
        })
        .collect();
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, cbz(&entries, Compression::Stored).unwrap()).unwrap();
}

fn titles(titles: &[&str]) -> Vec<String> {
    titles.iter().map(|title| (*title).to_owned()).collect()
}

#[tokio::test]
async fn lists_and_counts_only_the_series_under_thirty_minutes_left_at_the_learned_pace() {
    let shelf = Shelf::with_a_short_and_a_long_series("quick-reads-at-pace").await;
    shelf.learn_the_first_pace().await;

    let quick = shelf.quick_reads().await;

    assert_eq!(quick, (titles(&[SHORT]), 1));
}

#[tokio::test]
async fn lists_a_long_series_once_enough_of_it_is_read_to_leave_under_thirty_minutes() {
    let shelf = Shelf::with_a_short_and_a_long_series("quick-reads-half-read").await;
    shelf.learn_the_first_pace().await;

    shelf.read_on(LONG, LONG_PAGES / 2, SECONDS_A_PAGE).await;

    assert_eq!(shelf.quick_reads().await, (titles(&[LONG, SHORT]), 2));
}

#[tokio::test]
async fn drops_a_series_from_quick_reads_once_it_is_marked_read() {
    let shelf = Shelf::with_a_short_and_a_long_series("quick-reads-marked-read").await;
    shelf.learn_the_first_pace().await;
    let short = shelf.series_titled(SHORT).await;

    shelf.library.mark_series_read(vec![short]).await.unwrap();

    assert_eq!(shelf.quick_reads().await, (Vec::new(), 0));
}

#[tokio::test]
async fn lists_the_series_that_are_quick_reads_and_forgotten_together() {
    let shelf = Shelf::with_a_short_and_a_long_series("quick-reads-and-forgotten").await;
    shelf.learn_the_first_pace().await;
    shelf.read_on(LONG, LONG_PAGES / 2, SECONDS_A_PAGE).await;
    shelf.clock.advance(FORGOTTEN_AFTER);
    shelf.read_on(SHORT, 2, SECONDS_A_PAGE).await;

    let both = shelf
        .listed(&[SmartFilter::QuickReads, SmartFilter::Forgotten])
        .await;

    assert_eq!(both, (titles(&[LONG]), 1));
}

#[tokio::test]
async fn leaves_an_adult_marked_quick_read_out_of_the_list_and_count_in_screenshot_mode() {
    let shelf = Shelf::with_series(
        "quick-reads-screenshot-mode",
        &[(SHORT, SHORT_PAGES), (ADULT_SHORT, SHORT_PAGES)],
    )
    .await;
    shelf.learn_the_first_pace().await;
    let adult = shelf.series_titled(ADULT_SHORT).await;
    shelf
        .library
        .edit_series_details(
            adult,
            DetailEdits {
                title: None,
                people: None,
                tags: None,
                summary: None,
                is_marked_adult: true,
            },
        )
        .await
        .unwrap();
    let before = shelf.quick_reads().await;

    shelf.library.set_screenshot_mode(true);
    let during = shelf.quick_reads().await;

    assert_eq!(before, (titles(&[ADULT_SHORT, SHORT]), 2));
    assert_eq!(during, (titles(&[SHORT]), 1));
}

#[tokio::test]
async fn lists_no_quick_reads_and_offers_none_before_any_reading_was_timed() {
    let shelf = Shelf::with_a_short_and_a_long_series("quick-reads-untimed").await;

    let quick = shelf.quick_reads().await;

    assert_eq!(
        (quick, shelf.offers_quick_reads().await),
        ((Vec::new(), 0), false)
    );
}

#[tokio::test]
async fn lists_no_quick_reads_and_offers_none_while_learning_the_speed_is_off() {
    let shelf = Shelf::with_a_short_and_a_long_series("quick-reads-learning-off").await;
    shelf.library.set_learns_reading_speed(false);
    shelf.learn_the_first_pace().await;

    let quick = shelf.quick_reads().await;

    assert_eq!(
        (quick, shelf.offers_quick_reads().await),
        ((Vec::new(), 0), false)
    );
}

#[tokio::test]
async fn lists_and_offers_quick_reads_once_learning_the_speed_is_back_on() {
    let shelf = Shelf::with_a_short_and_a_long_series("quick-reads-learning-back-on").await;
    shelf.library.set_learns_reading_speed(false);
    shelf.learn_the_first_pace().await;
    shelf.library.set_learns_reading_speed(true);

    let quick = shelf.quick_reads().await;

    assert_eq!(
        (quick, shelf.offers_quick_reads().await),
        ((titles(&[SHORT]), 1), true)
    );
}

#[tokio::test]
async fn lists_nothing_for_an_active_quick_reads_chip_once_learning_the_speed_is_switched_off() {
    let shelf = Shelf::with_a_short_and_a_long_series("quick-reads-switched-off").await;
    shelf.learn_the_first_pace().await;
    let listed_while_learning = shelf.quick_reads().await;
    let offered_while_learning = shelf.offers_quick_reads().await;

    shelf.library.set_learns_reading_speed(false);

    assert_eq!(
        (listed_while_learning, offered_while_learning),
        ((titles(&[SHORT]), 1), true)
    );
    assert_eq!(
        (shelf.quick_reads().await, shelf.offers_quick_reads().await),
        ((Vec::new(), 0), false)
    );
}

#[tokio::test]
async fn pages_on_through_quick_reads_after_the_learned_speed_changed_between_pages() {
    let many: Vec<String> = (1..=MORE_THAN_A_PAGE_OF_SERIES)
        .map(|number| format!("Short Series {number:02}"))
        .collect();
    let series: Vec<(&str, u32)> = many.iter().map(|title| (title.as_str(), 2)).collect();
    let shelf = Shelf::with_series("quick-reads-speed-changes", &series).await;
    shelf.learn_the_first_pace().await;
    let mut listing = LibraryListing::default();
    listing.filter.smart = vec![SmartFilter::QuickReads];
    let first = shelf.library.series(listing.clone(), None).await.unwrap();

    shelf
        .learn_the_pace(SESSIONS_TO_OUTWEIGH_THE_FIRST_PACE, SLOWER_SECONDS_A_PAGE)
        .await;
    let second = shelf
        .library
        .series(listing, first.next.clone())
        .await
        .unwrap();

    assert_eq!(first.series.len(), SERIES_PER_PAGE);
    assert_eq!(first.series.len() + second.series.len(), many.len(),);
    assert_eq!(second.next, None);
}
