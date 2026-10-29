#![expect(
    clippy::unwrap_used,
    reason = "each test removes books from its own generated folder in a scratch library, so a failed set-up should stop the test"
)]

#[expect(dead_code, reason = "these tests write whole books, never loose pages")]
mod books;
mod scanned;
mod support;

use std::{
    collections::BTreeSet,
    fs,
    path::{Path, PathBuf},
    time::{Duration, SystemTime},
};

use books::write_book;
use omnileaf_db::{Config, Database, catalog::removed_among, rusqlite::Connection, store::Store};
use omnileaf_engine::{
    BookId, BookReading, DetailEdits, FileChanges, LIBRARY_CHANGES_GATHERED_FOR, LibraryChanges,
    LibraryListing, RemovalReport, RemovalTarget, RescanOutcome, SeriesBookListing, SeriesId,
};
use omnileaf_sync_proto::ProfileId;
use scanned::{Scanned, owned};
use support::{FixedClock, ScratchFolder};
use tokio::time::timeout;

const SERIES_01: &str = "Sample Series 01";
const SERIES_02: &str = "Sample Series 02";
const DATABASE_FILE: &str = "library.sqlite";
const CHANGED_AT: Duration = Duration::from_secs(1_800_000_001);
const ANOTHER_PROFILE: &str = "0b5e1a3c-7d2f-8a4b-9c6d-1e2f3a4b5c6d";

struct Removing {
    scanned: Scanned,
    comics: ScratchFolder,
}

impl Removing {
    async fn new(name: &str) -> Self {
        let comics = ScratchFolder::new(name);
        write_book(&comics.path().join(SERIES_01).join("v01.cbz"), 1);
        write_book(&comics.path().join(SERIES_01).join("v02.cbz"), 2);
        write_book(&comics.path().join(SERIES_02).join("v01.cbz"), 3);
        Self::scan(name, comics).await
    }

    async fn holding(name: &str, books: &[(&str, u64)]) -> Self {
        let comics = ScratchFolder::new(name);
        for (series, seed) in books {
            write_book(&comics.path().join(series).join("v01.cbz"), *seed);
        }
        Self::scan(name, comics).await
    }

    async fn scan(name: &str, comics: ScratchFolder) -> Self {
        let (scanned, _, _) = Scanned::folder(name, comics.path()).await;
        Self { scanned, comics }
    }

    fn path(&self, location: &str) -> PathBuf {
        self.comics.path().join(location)
    }

    async fn series(&self, title: &str) -> SeriesId {
        self.scanned
            .library
            .series(LibraryListing::default(), None)
            .await
            .unwrap()
            .series
            .into_iter()
            .find(|series| series.title == title)
            .unwrap()
            .id
    }

    async fn books(&self, title: &str) -> Vec<BookId> {
        let series = self.series(title).await;
        self.scanned
            .library
            .series_books(series, SeriesBookListing::default(), None)
            .await
            .unwrap()
            .books
            .into_iter()
            .map(|book| book.id)
            .collect()
    }

    fn other_device(&self) -> Store {
        let home = self.scanned.home.path();
        Store::new(
            Database::open(&Config {
                path: home.join(DATABASE_FILE),
                backup_dir: home.join("backups"),
                mmap_size_bytes: 0,
            })
            .unwrap(),
            FixedClock,
        )
    }

    async fn remove_folder(&self) {
        self.scanned
            .library
            .remove_folder(self.scanned.id)
            .await
            .unwrap();
    }

    async fn add_folder_again(&self) {
        self.scanned
            .library
            .add_folder(self.comics.path().to_path_buf(), |_| {})
            .await
            .unwrap();
    }

    fn markers(&self) -> u32 {
        self.scanned
            .connection()
            .query_row("SELECT count(*) FROM book_removed", [], |row| row.get(0))
            .unwrap()
    }

    async fn reading_of(&self, title: &str, book: BookId) -> BookReading {
        let series = self.series(title).await;
        self.scanned
            .library
            .series_books(series, SeriesBookListing::default(), None)
            .await
            .unwrap()
            .books
            .into_iter()
            .find(|listed| listed.id == book)
            .unwrap()
            .reading
    }

    async fn set_position(&self, book: BookId, page: u32) {
        let book: omnileaf_sync_proto::BookId = book.to_string().parse().unwrap();
        self.other_device()
            .write(move |writer| writer.set_position(book, page))
            .await
            .unwrap();
    }

    async fn mark_removed(&self, book: BookId) {
        let marked: omnileaf_sync_proto::BookId = book.to_string().parse().unwrap();
        self.other_device()
            .write(move |writer| writer.set_removed(marked, true))
            .await
            .unwrap();
    }

    async fn rescan(&self) -> RescanOutcome {
        let library = &self.scanned.library;
        let linked = library.folders(None).await.unwrap().folders.pop().unwrap();
        library
            .rescan_folder(linked.id, |_| {})
            .await
            .unwrap()
            .outcome
    }

    fn writer(&self) -> Connection {
        Connection::open(self.scanned.home.path().join(DATABASE_FILE)).unwrap()
    }

    async fn remove(&self, targets: &[RemovalTarget]) -> RemovalReport {
        self.scanned
            .library
            .remove_from_library(targets)
            .await
            .unwrap()
    }
}

fn mark_changed(path: &Path) {
    fs::File::options()
        .write(true)
        .open(path)
        .unwrap()
        .set_modified(SystemTime::UNIX_EPOCH + CHANGED_AT)
        .unwrap();
}

fn rescanned(changes: FileChanges) -> RescanOutcome {
    RescanOutcome::Rescanned(changes)
}

fn counts(removed_series: u32, removed_books: u32) -> RemovalReport {
    RemovalReport {
        removed_series,
        removed_books,
        files: Vec::new(),
    }
}

#[tokio::test]
async fn removing_a_series_removes_every_book_it_holds_and_reports_the_counts() {
    let linked = Removing::new("remove-series").await;
    let series = linked.series(SERIES_01).await;

    let report = linked.remove(&[RemovalTarget::Series { id: series }]).await;

    assert_eq!(report, counts(1, 2));
    assert_eq!(linked.scanned.series(), owned(&[(SERIES_02, 1)]));
}

#[tokio::test]
async fn removing_a_book_leaves_its_files_on_disk() {
    let linked = Removing::new("remove-book-keeps-file").await;
    let book = linked.books(SERIES_02).await[0];

    let report = linked.remove(&[RemovalTarget::Book { id: book }]).await;

    assert_eq!(report, counts(0, 1));
    assert!(linked.path(SERIES_02).join("v01.cbz").is_file());
}

#[tokio::test]
async fn removing_an_unknown_target_reports_zero_and_is_not_an_error() {
    let linked = Removing::new("remove-unknown").await;
    let elsewhere = Removing::holding("remove-unknown-elsewhere", &[(SERIES_02, 99)]).await;
    let strange_book = elsewhere.books(SERIES_02).await[0];
    let strange_series = elsewhere.series(SERIES_02).await;
    let targets = [
        RemovalTarget::Book { id: strange_book },
        RemovalTarget::Series { id: strange_series },
    ];

    let report = linked.remove(&targets).await;

    assert_eq!(report, counts(0, 0));
    assert_eq!(
        linked.scanned.series(),
        owned(&[(SERIES_01, 2), (SERIES_02, 1)])
    );
}

#[tokio::test]
async fn removing_the_same_target_twice_reports_zero_the_second_time() {
    let linked = Removing::new("remove-twice").await;
    let target = RemovalTarget::Series {
        id: linked.series(SERIES_01).await,
    };
    linked.remove(&[target]).await;

    let again = linked.remove(&[target]).await;

    assert_eq!(again, counts(0, 0));
}

#[tokio::test]
async fn a_series_and_one_of_its_books_together_count_the_book_once() {
    let linked = Removing::new("remove-series-and-book").await;
    let series = linked.series(SERIES_01).await;
    let book = linked.books(SERIES_01).await[0];

    let report = linked
        .remove(&[
            RemovalTarget::Book { id: book },
            RemovalTarget::Series { id: series },
        ])
        .await;

    assert_eq!(report, counts(1, 2));
}

#[tokio::test(start_paused = true)]
async fn a_removal_wakes_library_changes() {
    let linked = Removing::new("remove-wakes-changes").await;
    let book = linked.books(SERIES_02).await[0];
    let mut changes = linked.scanned.library.changes();
    caught_up(&mut changes).await;

    linked.remove(&[RemovalTarget::Book { id: book }]).await;

    assert!(
        timeout(LIBRARY_CHANGES_GATHERED_FOR * 4, changes.next())
            .await
            .is_ok()
    );
}

#[tokio::test]
async fn a_removal_is_visible_from_another_profile_as_household_scope() {
    let linked = Removing::new("remove-household").await;
    let book = linked.books(SERIES_02).await[0];
    linked.remove(&[RemovalTarget::Book { id: book }]).await;
    let store = linked.other_device();
    let marked: omnileaf_sync_proto::BookId = book.to_string().parse().unwrap();

    store
        .switch_profile(ANOTHER_PROFILE.parse::<ProfileId>().unwrap())
        .await
        .unwrap();

    let seen = store
        .database()
        .read(move |connection| removed_among(connection, &[marked]))
        .await
        .unwrap();
    assert_eq!(seen, BTreeSet::from([marked]));
}

#[tokio::test(start_paused = true)]
async fn removing_a_book_another_device_already_marked_still_removes_it_and_wakes_library_changes()
{
    let linked = Removing::new("remove-marked-first").await;
    let book = linked.books(SERIES_02).await[0];
    let marked: omnileaf_sync_proto::BookId = book.to_string().parse().unwrap();
    linked
        .other_device()
        .write(move |writer| writer.set_removed(marked, true))
        .await
        .unwrap();
    let mut changes = linked.scanned.library.changes();
    caught_up(&mut changes).await;

    let report = linked.remove(&[RemovalTarget::Book { id: book }]).await;

    assert_eq!(report, counts(0, 1));
    assert!(
        timeout(LIBRARY_CHANGES_GATHERED_FOR * 4, changes.next())
            .await
            .is_ok()
    );
}

#[tokio::test]
async fn a_rescan_leaves_a_removed_book_out_and_does_not_report_it_as_added() {
    let linked = Removing::new("rescan-removed-not-yet").await;
    let book = linked.books(SERIES_02).await[0];
    linked.remove(&[RemovalTarget::Book { id: book }]).await;

    let outcome = linked.rescan().await;

    assert_eq!(outcome, rescanned(FileChanges::default()));
    assert_eq!(linked.scanned.series(), owned(&[(SERIES_01, 2)]));
}

#[tokio::test]
async fn a_rescan_forgets_a_stored_book_another_device_marked_removed() {
    let linked = Removing::new("rescan-removed-stored").await;
    let book = linked.books(SERIES_02).await[0];
    linked.mark_removed(book).await;
    linked
        .writer()
        .execute("DELETE FROM book_details", [])
        .unwrap();

    let outcome = linked.rescan().await;

    assert_eq!(
        outcome,
        rescanned(FileChanges {
            removed: 1,
            ..FileChanges::default()
        })
    );
    assert_eq!(linked.scanned.series(), owned(&[(SERIES_01, 2)]));
}

#[tokio::test]
async fn a_rescan_counts_no_move_for_a_book_another_device_marked_removed() {
    let linked = Removing::new("rescan-removed-moved").await;
    let book = linked.books(SERIES_02).await[0];
    linked.mark_removed(book).await;
    fs::rename(
        linked.path("Sample Series 02/v01.cbz"),
        linked.path("Sample Series 02/v01 (fixed).cbz"),
    )
    .unwrap();

    let outcome = linked.rescan().await;

    assert_eq!(
        outcome,
        rescanned(FileChanges {
            removed: 1,
            ..FileChanges::default()
        })
    );
    assert_eq!(linked.scanned.series(), owned(&[(SERIES_01, 2)]));
}

#[tokio::test]
async fn a_file_changed_into_a_removed_book_forgets_the_book_it_held_and_stays_out() {
    let linked = Removing::new("rescan-removed-changed-into").await;
    let removed = linked.books(SERIES_02).await[0];
    linked.remove(&[RemovalTarget::Book { id: removed }]).await;
    let replaced = linked.path("Sample Series 01/v01.cbz");
    write_book(&replaced, 3);
    mark_changed(&replaced);

    let first = linked.rescan().await;
    let second = linked.rescan().await;

    assert_eq!(
        first,
        rescanned(FileChanges {
            removed: 1,
            ..FileChanges::default()
        })
    );
    assert_eq!(second, rescanned(FileChanges::default()));
    assert_eq!(linked.scanned.series(), owned(&[(SERIES_01, 1)]));
}

#[tokio::test]
async fn adding_the_folder_again_brings_back_removed_books_and_clears_the_markers_under_it() {
    let linked = Removing::new("readd-after-folder-removed").await;
    let series = linked.series(SERIES_01).await;
    linked.remove(&[RemovalTarget::Series { id: series }]).await;
    linked.remove_folder().await;

    linked.add_folder_again().await;

    assert_eq!(
        linked.scanned.series(),
        owned(&[(SERIES_01, 2), (SERIES_02, 1)])
    );
    assert_eq!(linked.markers(), 0);
    assert_eq!(linked.rescan().await, rescanned(FileChanges::default()));
    assert_eq!(
        linked.scanned.series(),
        owned(&[(SERIES_01, 2), (SERIES_02, 1)])
    );
}

#[tokio::test]
async fn adding_a_linked_folder_again_returns_a_book_removed_from_it_with_its_progress() {
    let linked = Removing::new("readd-linked-folder").await;
    let book = linked.books(SERIES_02).await[0];
    linked.set_position(book, 1).await;
    let reading = linked.reading_of(SERIES_02, book).await;
    linked.remove(&[RemovalTarget::Book { id: book }]).await;

    linked.add_folder_again().await;

    assert_eq!(
        linked.scanned.series(),
        owned(&[(SERIES_01, 2), (SERIES_02, 1)])
    );
    assert_eq!(linked.reading_of(SERIES_02, book).await, reading);
    assert_eq!(linked.markers(), 0);
}

#[tokio::test]
async fn adding_the_folder_again_restores_reading_progress_bookmarks_and_edits() {
    let linked = Removing::new("readd-restores-state").await;
    let series = linked.series(SERIES_01).await;
    let book = linked.books(SERIES_01).await[0];
    linked.set_position(book, 1).await;
    linked
        .scanned
        .library
        .bookmark_pages(book, vec![0], true)
        .await
        .unwrap();
    linked
        .scanned
        .library
        .edit_series_details(
            series,
            DetailEdits {
                title: None,
                people: None,
                tags: Some(vec!["lanterns".to_owned()]),
                summary: None,
                is_marked_adult: false,
            },
        )
        .await
        .unwrap();
    let reading = linked.reading_of(SERIES_01, book).await;
    linked.remove(&[RemovalTarget::Series { id: series }]).await;
    linked.remove_folder().await;

    linked.add_folder_again().await;

    let series = linked.series(SERIES_01).await;
    let overview = linked
        .scanned
        .library
        .series_overview(series)
        .await
        .unwrap();
    let details = linked.scanned.library.series_details(series).await.unwrap();
    assert_eq!(linked.reading_of(SERIES_01, book).await, reading);
    assert_eq!(overview.bookmark_count, 1);
    assert_eq!(details.tags.edited, Some(vec!["lanterns".to_owned()]));
    assert_eq!(linked.markers(), 0);
}

#[tokio::test]
async fn adding_the_folder_again_clears_a_removal_that_arrived_while_it_was_unlinked() {
    let linked = Removing::new("readd-marker-while-unlinked").await;
    let book = linked.books(SERIES_02).await[0];
    linked.remove_folder().await;
    linked.mark_removed(book).await;

    linked.add_folder_again().await;

    assert_eq!(
        linked.scanned.series(),
        owned(&[(SERIES_01, 2), (SERIES_02, 1)])
    );
    assert_eq!(linked.markers(), 0);
}

#[tokio::test]
async fn a_rescan_of_another_folder_does_not_clear_markers_of_books_it_does_not_hold() {
    let linked = Removing::new("rescan-other-folder").await;
    let book = linked.books(SERIES_02).await[0];
    linked.remove(&[RemovalTarget::Book { id: book }]).await;
    let other = ScratchFolder::new("rescan-other-folder-other");
    write_book(&other.path().join("Sample Series 03").join("v01.cbz"), 7);
    let library = &linked.scanned.library;
    library
        .add_folder(other.path().to_path_buf(), |_| {})
        .await
        .unwrap();
    let other_id = library
        .folders(None)
        .await
        .unwrap()
        .folders
        .pop()
        .unwrap()
        .id;
    linked
        .mark_removed(linked.books("Sample Series 03").await[0])
        .await;

    library.rescan_folder(other_id, |_| {}).await.unwrap();

    assert_eq!(linked.markers(), 2);
}

#[tokio::test]
async fn adding_a_folder_clears_only_the_markers_of_the_books_it_holds() {
    let linked = Removing::new("add-folder-other-markers").await;
    let kept_out = linked.books(SERIES_02).await[0];
    linked.remove(&[RemovalTarget::Book { id: kept_out }]).await;
    let other =
        Removing::holding("add-folder-other-markers-other", &[("Sample Series 03", 7)]).await;
    let held = other.books("Sample Series 03").await[0];
    let library = &linked.scanned.library;
    linked.mark_removed(held).await;

    library
        .add_folder(other.comics.path().to_path_buf(), |_| {})
        .await
        .unwrap();

    assert_eq!(linked.markers(), 1);
}

async fn caught_up(changes: &mut LibraryChanges) {
    while timeout(LIBRARY_CHANGES_GATHERED_FOR * 2, changes.next())
        .await
        .is_ok()
    {}
}
