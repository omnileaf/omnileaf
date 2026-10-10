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

use std::{
    fs, io,
    path::Path,
    sync::{Arc, Mutex, mpsc},
    thread,
    time::Duration,
};

use omnileaf_engine::{
    BookId, BookReading, LIBRARY_CHANGES_GATHERED_FOR, Library, LibraryChanged, LibraryChanges,
    LibraryListing, OpenedBook, ProbedFormat, READING_SAVE_DELAY, ReadMark, ReadingSaved,
    ResourceRouter, SeriesBookListing, SeriesId, UtcOffset,
};
use omnileaf_testkit::{ArchiveEntry, Compression, PageShape, cbz, page_jpeg};
use support::{FixedClock, ScratchFolder};
use tokio::{
    sync::{
        broadcast::{self, error::TryRecvError},
        oneshot,
    },
    task,
    time::{Instant, timeout},
};

const SEED: u64 = 47;
const PAGES: u32 = 6;
const LAST_PAGE: u32 = PAGES - 1;
const FOLDER: &str = "Sample Library";
const SERIES: &str = "Sample Series 01";
const FIRST_BOOK: &str = "Sample Series 01 v01";
const SECOND_BOOK: &str = "Sample Series 01 v02";
const MOVED_TO_SERIES: &str = "Sample Series 02";
const HANG_LIMIT: Duration = Duration::from_secs(60);
const DATABASE_FILE: &str = "library.sqlite";
const REFUSE_SAVES: &str = "CREATE TRIGGER refuse_saves BEFORE INSERT ON sync_register
    BEGIN SELECT RAISE(ABORT, 'saves refused'); END";

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
            .reading_restored(opened.id, opened.start_page, UtcOffset::UTC)
            .await
            .unwrap();
        opened
    }

    /// Makes every save of reading fail from now on, as a store that can't be written to does.
    fn refuse_saves(&self) {
        rusqlite::Connection::open(self.home.path().join(DATABASE_FILE))
            .unwrap()
            .execute_batch(REFUSE_SAVES)
            .unwrap();
    }

    async fn show(&self, opened: &OpenedBook, page: u32) {
        self.library
            .page_shown(opened.id, page, UtcOffset::UTC)
            .await
            .unwrap();
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

/// Waits for the next save, failing on the real clock rather than hanging, since a paused clock's timeout would fire while the store writes on its own thread.
async fn saved(changes: &mut broadcast::Receiver<omnileaf_engine::Changed>) {
    let (expired, expiry) = oneshot::channel();
    thread::spawn(move || {
        thread::sleep(HANG_LIMIT);
        expired.send(()).ok();
    });
    let saved = tokio::select! {
        saved = changes.recv() => Some(saved),
        _ = expiry => None,
    };
    saved.expect("a save in time").unwrap();
}

/// Runs `call` with the paused clock held still, so no save waiting out the save delay can land during it.
async fn before_the_save_delay<T>(call: impl Future<Output = T>) -> T {
    let (release, released) = mpsc::channel::<()>();
    let clock_held = task::spawn_blocking(move || released.recv());
    let output = call.await;
    drop(release);
    clock_held.await.unwrap().unwrap_err();
    output
}

/// The warnings logged on this thread, which runs the test and the library's tasks alike.
#[derive(Clone, Default)]
struct Warnings(Arc<Mutex<Vec<u8>>>);

impl io::Write for Warnings {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        self.0.lock().unwrap().extend_from_slice(bytes);
        Ok(bytes.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

impl Warnings {
    fn listen(&self) -> tracing::subscriber::DefaultGuard {
        let writer = self.clone();
        tracing::subscriber::set_default(
            tracing_subscriber::fmt()
                .with_max_level(tracing::Level::WARN)
                .with_ansi(false)
                .with_writer(move || writer.clone())
                .finish(),
        )
    }

    fn logged(&self) -> Vec<String> {
        String::from_utf8_lossy(&self.0.lock().unwrap())
            .lines()
            .map(str::to_owned)
            .collect()
    }
}

fn started_on(page_from_one: u32) -> BookReading {
    BookReading::Started {
        page: Some(page_from_one),
    }
}

#[tokio::test(start_paused = true)]
async fn saves_the_page_reading_reached_when_the_book_closes() {
    let shelf = Shelf::with_two_books("closed").await;
    let opened = shelf.restore(0).await;
    shelf.show(&opened, 1).await;
    shelf.show(&opened, 3).await;

    shelf.close(&opened).await;

    assert_eq!(shelf.reading(0).await, started_on(4));
}

#[tokio::test(start_paused = true)]
async fn saves_nothing_the_reader_shows_before_it_restores_the_book() {
    let shelf = Shelf::with_two_books("before-restore").await;
    let opened = shelf.open(0).await;
    shelf.show(&opened, 3).await;

    shelf.close(&opened).await;

    assert_eq!(shelf.reading(0).await, BookReading::NotStarted);
}

#[tokio::test(start_paused = true)]
async fn saves_the_page_shown_once_the_save_delay_has_passed_with_the_book_still_open() {
    let shelf = Shelf::with_two_books("delayed").await;
    let opened = shelf.restore(0).await;
    let mut changes = shelf.library.subscribe();

    shelf.show(&opened, 2).await;
    let shown_at = Instant::now();
    saved(&mut changes).await;

    assert_eq!(shown_at.elapsed(), READING_SAVE_DELAY);
    assert_eq!(shelf.reading(0).await, started_on(3));
}

#[tokio::test(start_paused = true)]
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

#[tokio::test(start_paused = true)]
async fn reads_a_series_with_the_page_reached_in_its_book_read_now_before_that_page_saves() {
    let shelf = Shelf::with_two_books("series-read-early").await;
    let opened = shelf.restore(0).await;
    shelf.show(&opened, 4).await;

    let overview = before_the_save_delay(shelf.library.series_overview(opened.series))
        .await
        .unwrap();

    assert_eq!(
        overview.up_next.map(|book| book.reading),
        Some(started_on(5))
    );
}

#[tokio::test(start_paused = true)]
async fn saves_the_page_shown_when_asked_to_with_the_book_still_open() {
    let shelf = Shelf::with_two_books("asked").await;
    let opened = shelf.restore(0).await;
    shelf.show(&opened, 2).await;

    shelf.library.save_reading().await.unwrap();

    assert_eq!(shelf.reading(0).await, started_on(3));
}

#[tokio::test(start_paused = true)]
async fn marks_the_book_read_once_its_last_page_is_saved() {
    let shelf = Shelf::with_two_books("finished").await;
    let opened = shelf.restore(0).await;
    shelf.show(&opened, LAST_PAGE).await;

    shelf.close(&opened).await;

    assert_eq!(shelf.reading(0).await, BookReading::Read);
}

#[tokio::test(start_paused = true)]
async fn marks_a_read_book_unread_once_a_page_before_its_last_is_saved() {
    let shelf = Shelf::with_two_books("read-again-unread").await;
    let finished = shelf.restore(0).await;
    shelf.show(&finished, LAST_PAGE).await;
    shelf.close(&finished).await;
    let again = shelf.restore(0).await;
    shelf.show(&again, 3).await;

    shelf.close(&again).await;

    assert_eq!(shelf.reading(0).await, started_on(4));
}

#[tokio::test(start_paused = true)]
async fn keeps_a_read_book_read_when_it_closes_again_with_no_page_turned() {
    let shelf = Shelf::with_two_books("reopened-read").await;
    let finished = shelf.restore(0).await;
    shelf.show(&finished, LAST_PAGE).await;
    shelf.close(&finished).await;
    let again = shelf.restore(0).await;

    shelf.close(&again).await;

    assert_eq!(shelf.reading(0).await, BookReading::Read);
}

#[tokio::test(start_paused = true)]
async fn ignores_a_page_shown_in_a_book_closed_before() {
    let shelf = Shelf::with_two_books("closed-before").await;
    let opened = shelf.restore(0).await;
    shelf.close(&opened).await;

    shelf.show(&opened, 3).await;
    shelf.library.save_reading().await.unwrap();

    assert_eq!(shelf.reading(0).await, BookReading::NotStarted);
}

#[tokio::test(start_paused = true)]
async fn saves_the_page_reached_in_a_book_when_the_next_one_opens() {
    let shelf = Shelf::with_two_books("next-book").await;
    let first = shelf.restore(0).await;
    shelf.show(&first, 2).await;

    shelf.open(1).await;

    assert_eq!(shelf.reading(0).await, started_on(3));
}

#[tokio::test(start_paused = true)]
async fn saves_the_page_reached_in_a_book_when_the_reader_restores_the_next_one() {
    let shelf = Shelf::with_two_books("next-restored").await;
    let first = shelf.restore(0).await;
    let second = shelf.open(1).await;
    shelf.show(&first, 2).await;

    shelf
        .library
        .reading_restored(second.id, second.start_page, UtcOffset::UTC)
        .await
        .unwrap();
    shelf.close(&second).await;

    assert_eq!(shelf.reading(0).await, started_on(3));
}

#[tokio::test(start_paused = true)]
async fn keeps_saving_the_book_restored_when_an_open_begun_before_it_finishes_after_it() {
    let shelf = Shelf::with_two_books("late-open").await;
    let read = shelf.restore(1).await;
    shelf.open(0).await;

    shelf.show(&read, 3).await;
    shelf.close(&read).await;

    assert_eq!(shelf.reading(1).await, started_on(4));
}

#[tokio::test(start_paused = true)]
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

#[tokio::test(start_paused = true)]
async fn opens_a_book_read_before_on_the_page_reading_it_again_reached() {
    let shelf = Shelf::with_two_books("read-again").await;
    let first_reading = shelf.restore(0).await;
    shelf.show(&first_reading, LAST_PAGE).await;
    shelf.close(&first_reading).await;
    let again = shelf.restore(0).await;
    shelf.show(&again, 3).await;
    shelf.close(&again).await;

    let opened = shelf.open(0).await;

    assert_eq!(
        (
            first_reading.start_page,
            again.start_page,
            opened.start_page
        ),
        (0, 0, 3)
    );
}

#[tokio::test(start_paused = true)]
async fn opens_a_book_opened_again_before_its_save_on_the_page_reading_reached() {
    let shelf = Shelf::with_two_books("opened-again-early").await;
    let opened = shelf.restore(0).await;
    shelf.show(&opened, 4).await;

    let again = before_the_save_delay(shelf.router.open_book(
        &shelf.library,
        opened.id,
        Vec::<ProbedFormat>::new(),
    ))
    .await
    .unwrap();

    assert_eq!(again.start_page, 4);
}

#[tokio::test(start_paused = true)]
async fn opens_a_book_left_while_saves_fail_on_the_page_reading_reached() {
    let shelf = Shelf::with_two_books("left-while-saves-fail").await;
    shelf.refuse_saves();
    let first = shelf.restore(0).await;
    shelf.show(&first, 4).await;
    shelf.restore(1).await;

    let again = shelf.open(0).await;

    assert_eq!((again.start_page, again.reading), (4, started_on(5)));
}

#[tokio::test(start_paused = true)]
async fn opens_a_book_opened_again_while_saves_fail_on_the_page_reading_reached() {
    let shelf = Shelf::with_two_books("opened-again-while-saves-fail").await;
    shelf.refuse_saves();
    let opened = shelf.restore(0).await;
    shelf.show(&opened, 4).await;

    let again = shelf.open(0).await;

    assert_eq!((again.start_page, again.reading), (4, started_on(5)));
}

#[tokio::test(start_paused = true)]
async fn warns_once_of_saves_that_keep_failing_however_often_the_library_is_read() {
    let shelf = Shelf::with_two_books("warns-once-while-saves-fail").await;
    let warnings = Warnings::default();
    let _listening = warnings.listen();
    shelf.refuse_saves();
    let opened = shelf.restore(0).await;
    shelf.show(&opened, 4).await;

    for _ in 0..2 {
        shelf.library.series_overview(opened.series).await.unwrap();
        shelf.open(1).await;
    }

    assert_eq!(warnings.logged().len(), 1, "{:#?}", warnings.logged());
}

#[tokio::test(start_paused = true)]
async fn keeps_a_book_marked_unread_while_open_unread_after_the_save_that_comes_late() {
    let shelf = Shelf::with_two_books("marked-unread").await;
    let opened = shelf.restore(0).await;
    shelf.show(&opened, LAST_PAGE).await;

    shelf
        .library
        .mark_books(vec![opened.id], ReadMark::Unread)
        .await
        .unwrap();
    shelf.close(&opened).await;

    assert_eq!(shelf.reading(0).await, started_on(PAGES));
}

#[tokio::test(start_paused = true)]
async fn keeps_a_book_marked_read_while_open_read_after_the_save_that_comes_late() {
    let shelf = Shelf::with_two_books("marked-read").await;
    let opened = shelf.restore(0).await;
    shelf.show(&opened, 2).await;

    shelf
        .library
        .mark_books(vec![opened.id], ReadMark::Read)
        .await
        .unwrap();
    shelf.close(&opened).await;

    assert_eq!(shelf.reading(0).await, BookReading::Read);
}

/// Every change already told of, so a test can wait for the one it makes next.
async fn caught_up(changes: &mut LibraryChanges) {
    while timeout(LIBRARY_CHANGES_GATHERED_FOR * 2, changes.next())
        .await
        .is_ok()
    {}
}

async fn tells_of_a_change(changes: &mut LibraryChanges) -> bool {
    timeout(LIBRARY_CHANGES_GATHERED_FOR * 4, changes.next())
        .await
        .is_ok_and(|told| told == Some(LibraryChanged))
}

async fn tells_of_no_change(changes: &mut LibraryChanges) -> bool {
    timeout(LIBRARY_CHANGES_GATHERED_FOR * 4, changes.next())
        .await
        .is_err()
}

#[tokio::test(start_paused = true)]
async fn tells_the_library_of_the_first_page_saved_in_a_book() {
    let shelf = Shelf::with_two_books("first-save-told").await;
    let mut changes = shelf.library.changes();
    caught_up(&mut changes).await;
    let opened = shelf.restore(0).await;
    shelf.show(&opened, 2).await;

    shelf.close(&opened).await;

    assert!(tells_of_a_change(&mut changes).await);
}

#[tokio::test(start_paused = true)]
async fn tells_the_library_nothing_of_a_later_page_saved_in_a_started_book() {
    let shelf = Shelf::with_two_books("later-save-untold").await;
    let first = shelf.restore(0).await;
    shelf.show(&first, 2).await;
    shelf.close(&first).await;
    let mut changes = shelf.library.changes();
    caught_up(&mut changes).await;
    let again = shelf.restore(0).await;
    shelf.show(&again, 3).await;

    shelf.close(&again).await;

    assert_eq!(shelf.reading(0).await, started_on(4));
    assert!(tells_of_no_change(&mut changes).await);
}

#[tokio::test(start_paused = true)]
async fn tells_the_library_of_books_marked_read_and_unread() {
    let shelf = Shelf::with_two_books("marks-told").await;
    let book = shelf.book(0).await;
    let mut changes = shelf.library.changes();
    caught_up(&mut changes).await;

    shelf
        .library
        .mark_books(vec![book], ReadMark::Read)
        .await
        .unwrap();
    let told_read = tells_of_a_change(&mut changes).await;
    shelf
        .library
        .mark_books(vec![book], ReadMark::Unread)
        .await
        .unwrap();
    let told_unread = tells_of_a_change(&mut changes).await;

    assert_eq!((told_read, told_unread), (true, true));
}

#[tokio::test(start_paused = true)]
async fn tells_of_the_book_and_series_of_each_page_saved() {
    let shelf = Shelf::with_two_books("saved-told").await;
    let mut saved = shelf.library.reading_saved();
    let first = shelf.restore(0).await;
    shelf.show(&first, 2).await;
    let second = shelf.restore(1).await;
    shelf.show(&second, 3).await;

    shelf.close(&second).await;

    let told = [saved.try_recv(), saved.try_recv(), saved.try_recv()];
    let of = |opened: &OpenedBook| {
        Ok(ReadingSaved {
            book: opened.id,
            series: opened.series,
        })
    };
    assert_eq!(told, [of(&first), of(&second), Err(TryRecvError::Empty)]);
}

#[tokio::test(start_paused = true)]
async fn tells_of_the_series_a_book_is_in_when_its_page_saves_after_a_rescan_moved_it() {
    let shelf = Shelf::with_two_books("saved-moved").await;
    let opened = shelf.restore(0).await;
    let moved_to = shelf.comics.path().join(FOLDER).join(MOVED_TO_SERIES);
    fs::create_dir_all(&moved_to).unwrap();
    fs::rename(
        shelf
            .comics
            .path()
            .join(FOLDER)
            .join(SERIES)
            .join(format!("{FIRST_BOOK}.cbz")),
        moved_to.join(format!("{FIRST_BOOK}.cbz")),
    )
    .unwrap();
    let folder = shelf
        .library
        .folders(None)
        .await
        .unwrap()
        .folders
        .pop()
        .unwrap();
    shelf
        .library
        .rescan_folder(folder.id, |_| {})
        .await
        .unwrap();
    let mut saved = shelf.library.reading_saved();
    shelf.show(&opened, 2).await;

    shelf.close(&opened).await;

    let told = saved.try_recv().unwrap();
    assert_ne!(told.series, opened.series);
    assert_eq!(
        shelf
            .library
            .series_books(told.series, SeriesBookListing::default(), None)
            .await
            .unwrap()
            .books
            .iter()
            .map(|book| book.id)
            .collect::<Vec<_>>(),
        [opened.id]
    );
}

#[tokio::test(start_paused = true)]
async fn tells_of_no_save_when_no_page_was_left_to_save() {
    let shelf = Shelf::with_two_books("saved-untold").await;
    let mut saved = shelf.library.reading_saved();
    let opened = shelf.restore(0).await;
    shelf.show(&opened, 2).await;
    shelf.show(&opened, 0).await;

    shelf.close(&opened).await;
    shelf.library.save_reading().await.unwrap();

    assert_eq!(saved.try_recv(), Err(TryRecvError::Empty));
}
