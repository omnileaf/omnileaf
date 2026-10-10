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
use omnileaf_db::catalog::{SeriesOrder, series_books, series_page};
use omnileaf_engine::{BooksRemoval, LibraryFolder, RescanOutcome};
use omnileaf_sync_proto::BookId;
use scanned::{Scanned, owned, whole_page};
use support::ScratchFolder;

const SERIES_01: &str = "Sample Series 01";
const SERIES_02: &str = "Sample Series 02";

/// A folder of three books in two series, scanned once into a library of its own.
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

    /// Takes every book out of the folder and rescans it, which keeps them as it finds the folder empty.
    async fn empty(&self) {
        for series in [SERIES_01, SERIES_02] {
            fs::remove_dir_all(self.path(series)).unwrap();
        }
        let rescan = self
            .scanned
            .library
            .rescan_folder(self.scanned.id, |_| {})
            .await
            .unwrap();
        assert_eq!(rescan.outcome, RescanOutcome::FoundEmpty);
    }

    async fn remove_books(&self) -> BooksRemoval {
        self.scanned
            .library
            .remove_books_of_emptied_folder(self.scanned.id)
            .await
            .unwrap()
    }

    async fn put_back(&self) -> bool {
        self.scanned
            .library
            .put_back_removed_books(self.scanned.id)
            .await
            .unwrap()
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

    fn book_ids(&self) -> Vec<BookId> {
        let connection = self.scanned.connection();
        series_page(&connection, SeriesOrder::Title, &whole_page())
            .unwrap()
            .items
            .into_iter()
            .flat_map(|series| {
                series_books(&connection, series.id, &whole_page())
                    .unwrap()
                    .items
            })
            .map(|book| book.id)
            .collect()
    }

    fn every_series(&self) -> Vec<(String, u32)> {
        owned(&[(SERIES_01, 2), (SERIES_02, 1)])
    }
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
async fn keeps_every_book_of_a_folder_that_is_missing() {
    let linked = Linked::new("emptied-missing").await;
    let unplugged = linked.comics.path().with_extension("unplugged");
    fs::rename(linked.comics.path(), &unplugged).unwrap();

    let removal = linked.remove_books().await;

    fs::rename(&unplugged, linked.comics.path()).unwrap();
    assert_eq!(removal, BooksRemoval::Kept);
    assert_eq!(linked.scanned.series(), linked.every_series());
}

#[tokio::test]
async fn keeps_every_book_of_a_folder_that_holds_books_again() {
    let linked = Linked::new("emptied-refilled").await;
    linked.empty().await;
    write_book(&linked.path(SERIES_01).join("v01.cbz"), 1);

    let removal = linked.remove_books().await;

    assert_eq!(removal, BooksRemoval::Kept);
    assert_eq!(linked.scanned.series(), linked.every_series());
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
    assert_eq!(linked.scanned.series(), linked.every_series());
}

#[tokio::test]
async fn puts_back_the_books_it_removed_under_their_own_ids() {
    let linked = Linked::new("emptied-put-back").await;
    linked.empty().await;
    let before = linked.book_ids();
    linked.remove_books().await;

    let is_put_back = linked.put_back().await;

    assert!(is_put_back);
    assert_eq!(linked.scanned.series(), linked.every_series());
    assert_eq!(linked.book_ids(), before);
    assert_eq!(linked.scanned.books_in(SERIES_01), ["v01", "v02"]);
    assert!(!linked.folder().await.is_available);
}

#[tokio::test]
async fn puts_back_nothing_for_a_folder_whose_books_it_did_not_remove() {
    let linked = Linked::new("emptied-nothing-kept").await;
    linked.empty().await;

    let is_put_back = linked.put_back().await;

    assert!(!is_put_back);
    assert_eq!(linked.scanned.series(), linked.every_series());
}

#[tokio::test]
async fn puts_back_the_books_only_once() {
    let linked = Linked::new("emptied-put-back-once").await;
    linked.empty().await;
    linked.remove_books().await;
    linked.put_back().await;

    let is_put_back_again = linked.put_back().await;

    assert!(!is_put_back_again);
}

#[tokio::test]
async fn puts_back_nothing_once_the_folder_holds_books_again() {
    let linked = Linked::new("emptied-refilled-before-undo").await;
    linked.empty().await;
    linked.remove_books().await;
    write_book(&linked.path(SERIES_01).join("v09.cbz"), 9);
    linked
        .scanned
        .library
        .rescan_folder(linked.scanned.id, |_| {})
        .await
        .unwrap();

    let is_put_back = linked.put_back().await;

    assert!(!is_put_back);
    assert_eq!(linked.scanned.series(), owned(&[(SERIES_01, 1)]));
    assert!(linked.folder().await.is_available);
}
