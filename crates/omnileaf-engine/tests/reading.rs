#![expect(
    clippy::unwrap_used,
    clippy::expect_used,
    reason = "each test opens its own library in a scratch folder, so a failed set-up should stop the test"
)]

#[expect(
    dead_code,
    reason = "these tests need scratch folders but none of the files support can put in them"
)]
mod support;

use std::{fs, path::Path, time::Duration};

use omnileaf_engine::{
    BookId, BookReading, Library, LibraryListing, OpenedBook, ProbedFormat, ResourceRouter,
    SeriesBookListing, SeriesId,
};
use omnileaf_testkit::{ArchiveEntry, Compression, PageShape, cbz, page_jpeg};
use support::{FixedClock, ScratchFolder};
use tokio::{sync::broadcast, time::timeout};

const SEED: u64 = 47;
const PAGES: u32 = 6;
const LAST_PAGE: u32 = PAGES - 1;
const FOLDER: &str = "Sample Library";
const SERIES: &str = "Sample Series 01";
const FIRST_BOOK: &str = "Sample Series 01 v01";
const SECOND_BOOK: &str = "Sample Series 01 v02";
/// Longer than the core waits before saving a page shown, so a save not made by then never comes.
const SAVE_WAIT: Duration = Duration::from_secs(10);
/// A moment short of the 1.5 s the core waits before saving a page shown.
const JUST_BEFORE_THE_SAVE: Duration = Duration::from_millis(1_400);

struct Shelf {
    library: Library,
    router: ResourceRouter,
    home: ScratchFolder,
    comics: ScratchFolder,
    cache: ScratchFolder,
}

impl Shelf {
    async fn with_two_books(name: &str) -> Self {
        let comics = ScratchFolder::new(&format!("{name}-comics"));
        let series = comics.path().join(FOLDER).join(SERIES);
        write_book(&series.join(format!("{FIRST_BOOK}.cbz")), SEED);
        write_book(&series.join(format!("{SECOND_BOOK}.cbz")), SEED + 1);
        let home = ScratchFolder::new(&format!("{name}-home"));
        let library = Library::open(home.path().to_path_buf(), FixedClock)
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
            home,
            comics,
            cache,
        }
    }

    /// The same folders opened again, as after the app was stopped and launched again.
    async fn reopened(self) -> Self {
        let Self {
            library,
            router,
            home,
            comics,
            cache,
        } = self;
        drop(router);
        drop(library);
        let library = Library::open(home.path().to_path_buf(), FixedClock)
            .await
            .unwrap();
        let router = ResourceRouter::open(cache.path()).unwrap();
        Self {
            library,
            router,
            home,
            comics,
            cache,
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

    async fn book(&self, index: usize) -> BookId {
        self.books().await.get(index).unwrap().0
    }

    async fn reading(&self, index: usize) -> BookReading {
        self.books().await.get(index).unwrap().1
    }

    async fn books(&self) -> Vec<(BookId, BookReading)> {
        let page = self
            .library
            .series_books(self.series().await, SeriesBookListing::default(), None)
            .await
            .unwrap();
        page.books
            .into_iter()
            .map(|book| (book.id, book.reading))
            .collect()
    }

    async fn open(&self, index: usize) -> OpenedBook {
        let book = self.book(index).await;
        self.router
            .open_book(&self.library, book, Vec::<ProbedFormat>::new())
            .await
            .unwrap()
    }

    /// Opens the book as the reader does, showing the page it starts on.
    async fn restore(&self, index: usize) -> OpenedBook {
        let opened = self.open(index).await;
        self.library
            .reading_restored(opened.id, opened.start_page)
            .await
            .unwrap();
        opened
    }

    async fn show(&self, opened: &OpenedBook, page: u32) {
        self.library.page_shown(opened.id, page).await.unwrap();
    }

    async fn close(&self, opened: &OpenedBook) {
        self.library.close_book(opened.id).await.unwrap();
    }
}

fn write_book(path: &Path, seed: u64) {
    let entries: Vec<ArchiveEntry> = (0..PAGES)
        .map(|index| ArchiveEntry {
            name: format!("{:03}.jpg", index + 1),
            bytes: page_jpeg(seed, index, PageShape::Portrait).unwrap(),
        })
        .collect();
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, cbz(&entries, Compression::Stored).unwrap()).unwrap();
}

async fn saved(changes: &mut broadcast::Receiver<omnileaf_engine::Changed>) {
    timeout(SAVE_WAIT, changes.recv())
        .await
        .expect("a save within the time the core waits before saving")
        .unwrap();
}

fn started_on(page_from_one: u32) -> BookReading {
    BookReading::Started {
        page: Some(page_from_one),
    }
}

#[tokio::test]
async fn saves_the_page_reading_reached_when_the_book_closes() {
    let shelf = Shelf::with_two_books("closed").await;
    let opened = shelf.restore(0).await;
    shelf.show(&opened, 1).await;
    shelf.show(&opened, 3).await;

    shelf.close(&opened).await;

    assert_eq!(shelf.reading(0).await, started_on(4));
}

#[tokio::test]
async fn saves_nothing_the_reader_shows_before_it_restores_the_book() {
    let shelf = Shelf::with_two_books("before-restore").await;
    let opened = shelf.open(0).await;
    shelf.show(&opened, 3).await;

    shelf.close(&opened).await;

    assert_eq!(shelf.reading(0).await, BookReading::NotStarted);
}

#[tokio::test]
async fn saves_the_page_shown_once_the_save_delay_has_passed_with_the_book_still_open() {
    let shelf = Shelf::with_two_books("delayed").await;
    let opened = shelf.restore(0).await;
    let mut changes = shelf.library.subscribe();

    shelf.show(&opened, 2).await;
    let early = timeout(JUST_BEFORE_THE_SAVE, changes.recv()).await;
    saved(&mut changes).await;

    assert!(early.is_err(), "saved early: {early:?}");
    assert_eq!(shelf.reading(0).await, started_on(3));
}

#[tokio::test]
async fn opens_the_book_on_the_page_saved_once_the_library_opens_again() {
    let shelf = Shelf::with_two_books("resumed").await;
    let opened = shelf.restore(0).await;
    let mut changes = shelf.library.subscribe();
    shelf.show(&opened, 4).await;
    saved(&mut changes).await;

    let shelf = shelf.reopened().await;
    let again = shelf.open(0).await;

    assert_eq!(again.start_page, 4);
}

#[tokio::test]
async fn saves_the_page_shown_when_asked_to_with_the_book_still_open() {
    let shelf = Shelf::with_two_books("asked").await;
    let opened = shelf.restore(0).await;
    shelf.show(&opened, 2).await;

    shelf.library.save_reading().await.unwrap();

    assert_eq!(shelf.reading(0).await, started_on(3));
}

#[tokio::test]
async fn marks_the_book_read_once_its_last_page_is_saved() {
    let shelf = Shelf::with_two_books("finished").await;
    let opened = shelf.restore(0).await;
    shelf.show(&opened, LAST_PAGE).await;

    shelf.close(&opened).await;

    assert_eq!(shelf.reading(0).await, BookReading::Read);
}

#[tokio::test]
async fn ignores_a_page_shown_in_a_book_closed_before() {
    let shelf = Shelf::with_two_books("closed-before").await;
    let opened = shelf.restore(0).await;
    shelf.close(&opened).await;

    shelf.show(&opened, 3).await;
    shelf.library.save_reading().await.unwrap();

    assert_eq!(shelf.reading(0).await, BookReading::NotStarted);
}

#[tokio::test]
async fn saves_the_page_reached_in_a_book_when_the_next_one_opens() {
    let shelf = Shelf::with_two_books("next-book").await;
    let first = shelf.restore(0).await;
    shelf.show(&first, 2).await;

    shelf.open(1).await;

    assert_eq!(shelf.reading(0).await, started_on(3));
}

#[tokio::test]
async fn saves_the_page_reached_in_a_book_when_the_reader_restores_the_next_one() {
    let shelf = Shelf::with_two_books("next-restored").await;
    let first = shelf.restore(0).await;
    let second = shelf.open(1).await;
    shelf.show(&first, 2).await;

    shelf
        .library
        .reading_restored(second.id, second.start_page)
        .await
        .unwrap();

    assert_eq!(shelf.reading(0).await, started_on(3));
}

#[tokio::test]
async fn keeps_saving_the_book_restored_when_an_open_begun_before_it_finishes_after_it() {
    let shelf = Shelf::with_two_books("late-open").await;
    let read = shelf.restore(1).await;
    shelf.open(0).await;

    shelf.show(&read, 3).await;
    shelf.close(&read).await;

    assert_eq!(shelf.reading(1).await, started_on(4));
}

#[tokio::test]
async fn keeps_a_page_shown_in_one_book_out_of_the_book_read_after_it() {
    let shelf = Shelf::with_two_books("other-book").await;
    let first = shelf.restore(0).await;
    let second = shelf.restore(1).await;

    shelf.show(&first, 3).await;
    shelf.close(&second).await;

    assert_eq!(
        [shelf.reading(0).await, shelf.reading(1).await],
        [BookReading::NotStarted, BookReading::NotStarted]
    );
}
