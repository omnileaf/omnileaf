#![expect(
    clippy::unwrap_used,
    reason = "each test empties its own generated folder in a scratch library, so a failed set-up should stop the test"
)]

#[expect(dead_code, reason = "these tests write whole books, never loose pages")]
mod books;
mod scanned;
mod support;

use std::{fs, path::PathBuf};

use books::write_book;
use omnileaf_db::{
    Config, Database,
    catalog::{BookListing, SeriesListing, SeriesOrder, SeriesSort, series_books, series_page},
    store::{ReadingState, Store, reading_state},
};
use omnileaf_engine::{BooksRemoval, FolderKind, LibraryFolder, RescanOutcome};
use omnileaf_sync_proto::BookId;
use scanned::{Scanned, owned, whole_page};
use support::{FixedClock, ScratchFolder};

const SERIES_01: &str = "Sample Series 01";
const SERIES_02: &str = "Sample Series 02";
const DATABASE_FILE: &str = "library.sqlite";

struct Linked {
    scanned: Scanned,
    comics: ScratchFolder,
}

impl Linked {
    async fn new(name: &str) -> Self {
        let comics = ScratchFolder::new(name);
        write_book(&comics.path().join(SERIES_01).join("v01.cbz"), 1);
        write_book(&comics.path().join(SERIES_01).join("v02.cbz"), 2);
        write_book(&comics.path().join(SERIES_02).join("v01.cbz"), 3);
        let (scanned, _, _) = Scanned::folder(name, comics.path()).await;
        Self { scanned, comics }
    }

    fn path(&self, location: &str) -> PathBuf {
        self.comics.path().join(location)
    }

    async fn empty(&self) {
        for series in [SERIES_01, SERIES_02] {
            fs::remove_dir_all(self.path(series)).unwrap();
        }
        assert_eq!(self.rescan().await, RescanOutcome::FoundEmpty);
    }

    async fn remove_books(&self) -> BooksRemoval {
        self.scanned
            .library
            .remove_books_of_emptied_folder(self.scanned.id)
            .await
            .unwrap()
    }

    async fn rescan(&self) -> RescanOutcome {
        self.scanned
            .library
            .rescan_folder(self.scanned.id, |_| {})
            .await
            .unwrap()
            .outcome
    }

    fn first_book_in(&self, title: &str) -> BookId {
        let connection = self.scanned.connection();
        let series = series_page(
            &connection,
            &SeriesListing::unfiltered(SeriesSort::ascending(SeriesOrder::Title)),
            &whole_page(),
        )
        .unwrap()
        .items
        .into_iter()
        .find(|series| series.title == title)
        .unwrap();
        series_books(&connection, series.id, BookListing::IN_ORDER, &whole_page())
            .unwrap()
            .items
            .first()
            .unwrap()
            .id
    }

    async fn set_position(&self, book: BookId, page: u32) {
        let home = self.scanned.home.path();
        let config = Config {
            path: home.join(DATABASE_FILE),
            backup_dir: home.join("backups"),
            mmap_size_bytes: 0,
        };
        Store::new(Database::open(&config).unwrap(), FixedClock)
            .write(move |writer| writer.set_position(book, page))
            .await
            .unwrap();
    }

    fn position_of(&self, book: BookId) -> Option<u32> {
        reading_state(&self.scanned.connection(), book)
            .unwrap()
            .and_then(|state: ReadingState| state.position_page)
    }

    async fn folder(&self) -> LibraryFolder {
        self.scanned
            .library
            .folders(None)
            .await
            .unwrap()
            .folders
            .into_iter()
            .find(|folder| folder.id == self.scanned.id)
            .unwrap()
    }
}

fn every_series() -> Vec<(String, u32)> {
    owned(&[(SERIES_01, 2), (SERIES_02, 1)])
}

#[tokio::test]
async fn removes_every_book_of_a_folder_found_empty_and_marks_it_available() {
    let linked = Linked::new("emptied-removed").await;
    linked.empty().await;

    let removal = linked.remove_books().await;

    assert_eq!(removal, BooksRemoval::Removed { books: 3 });
    assert_eq!(linked.scanned.series(), owned(&[]));
    assert!(linked.folder().await.is_available);
}

#[tokio::test]
async fn keeps_the_reading_progress_of_removed_books_for_when_they_return() {
    let linked = Linked::new("emptied-progress").await;
    let book = linked.first_book_in(SERIES_02);
    linked.set_position(book, 8).await;
    linked.empty().await;
    assert_eq!(
        linked.remove_books().await,
        BooksRemoval::Removed { books: 3 }
    );
    write_book(&linked.path(SERIES_02).join("v01.cbz"), 3);

    linked.rescan().await;

    assert_eq!(linked.first_book_in(SERIES_02), book);
    assert_eq!(linked.position_of(book), Some(8));
}

#[tokio::test]
async fn keeps_every_book_of_a_folder_that_is_missing() {
    let linked = Linked::new("emptied-missing").await;
    let unplugged = linked.comics.path().with_extension("unplugged");
    fs::rename(linked.comics.path(), &unplugged).unwrap();

    let removal = linked.remove_books().await;

    fs::rename(&unplugged, linked.comics.path()).unwrap();
    assert_eq!(removal, BooksRemoval::Kept);
    assert_eq!(linked.scanned.series(), every_series());
}

#[tokio::test]
async fn keeps_every_book_of_a_folder_that_holds_books_again() {
    let linked = Linked::new("emptied-refilled").await;
    linked.empty().await;
    write_book(&linked.path(SERIES_01).join("v01.cbz"), 1);

    let removal = linked.remove_books().await;

    assert_eq!(removal, BooksRemoval::Kept);
    assert_eq!(linked.scanned.series(), every_series());
}

#[cfg(unix)]
#[tokio::test]
async fn keeps_every_book_of_a_folder_with_a_subfolder_it_cannot_read() {
    use std::os::unix::fs::PermissionsExt;
    let linked = Linked::new("emptied-locked").await;
    fs::remove_dir_all(linked.path(SERIES_01)).unwrap();
    let locked = linked.path(SERIES_02);
    fs::set_permissions(&locked, fs::Permissions::from_mode(0o000)).unwrap();

    let removal = linked.remove_books().await;

    fs::set_permissions(&locked, fs::Permissions::from_mode(0o755)).unwrap();
    assert_eq!(removal, BooksRemoval::Kept);
    assert_eq!(linked.scanned.series(), every_series());
}

#[tokio::test]
async fn keeps_a_book_another_folder_also_holds() {
    let linked = Linked::new("emptied-shared").await;
    let other = ScratchFolder::new("emptied-shared-other");
    write_book(&other.path().join(SERIES_01).join("v01.cbz"), 1);
    linked
        .scanned
        .library
        .add_folder(other.path().to_path_buf(), |_| {})
        .await
        .unwrap();
    linked.empty().await;

    let removal = linked.remove_books().await;

    assert_eq!(removal, BooksRemoval::Removed { books: 2 });
    assert_eq!(linked.scanned.books_in(SERIES_01), ["v01"]);
}

#[tokio::test]
async fn never_removes_the_books_of_the_home_folder() {
    let linked = Linked::new("emptied-home").await;
    let home = linked
        .scanned
        .library
        .folders(None)
        .await
        .unwrap()
        .folders
        .into_iter()
        .find(|folder| folder.kind == FolderKind::Home)
        .unwrap();

    let removal = linked
        .scanned
        .library
        .remove_books_of_emptied_folder(home.id)
        .await
        .unwrap();

    assert_eq!(removal, BooksRemoval::Kept);
}
