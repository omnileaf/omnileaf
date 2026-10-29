#![expect(
    clippy::unwrap_used,
    reason = "each test removes books from its own generated folder in a scratch library, so a failed set-up should stop the test"
)]

#[expect(dead_code, reason = "these tests write whole books, never loose pages")]
mod books;
mod scanned;
mod support;

use std::{collections::BTreeSet, path::PathBuf};

use books::write_book;
use omnileaf_db::{Config, Database, catalog::removed_among, store::Store};
use omnileaf_engine::{
    BookId, LIBRARY_CHANGES_GATHERED_FOR, LibraryChanges, LibraryListing, RemovalReport,
    RemovalTarget, SeriesBookListing, SeriesId,
};
use omnileaf_sync_proto::ProfileId;
use scanned::{Scanned, owned};
use support::{FixedClock, ScratchFolder};
use tokio::time::timeout;

const SERIES_01: &str = "Sample Series 01";
const SERIES_02: &str = "Sample Series 02";
const DATABASE_FILE: &str = "library.sqlite";
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

    async fn remove(&self, targets: &[RemovalTarget]) -> RemovalReport {
        self.scanned
            .library
            .remove_from_library(targets)
            .await
            .unwrap()
    }
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

async fn caught_up(changes: &mut LibraryChanges) {
    while timeout(LIBRARY_CHANGES_GATHERED_FOR * 2, changes.next())
        .await
        .is_ok()
    {}
}
