#![expect(
    clippy::unwrap_used,
    reason = "each test rescans its own generated folder in a scratch library, so a failed set-up should stop the test"
)]

mod books;
mod scanned;
mod support;

use std::{
    fs,
    path::{Path, PathBuf},
    time::{Duration, SystemTime},
};

use books::{write_book, write_book_with, write_page};
use omnileaf_db::{
    Config, Database,
    catalog::{SeriesOrder, series_books, series_page},
    store::{ReadingState, Store, reading_state},
};
use omnileaf_engine::{
    FileChanges, FolderRescan, Library, LibraryFolder, RescanOutcome, ScanProgress,
};
use omnileaf_sync_proto::BookId;
use scanned::{Scanned, owned, whole_page};
use support::{FixedClock, TempFolder};

const SERIES_01: &str = "Sample Series 01";
const SERIES_02: &str = "Sample Series 02";
const SERIES_03: &str = "Sample Series 03";
const CHANGED_AT: Duration = Duration::from_secs(1_800_000_001);
const DATABASE_FILE: &str = "library.sqlite";

/// A folder of three books in two series, scanned once into a library of its own.
struct Rescanned {
    scanned: Scanned,
    comics: TempFolder,
}

impl Rescanned {
    async fn new(name: &str) -> Self {
        let comics = TempFolder::new(name);
        write_book(&comics.path().join(SERIES_01).join("v01.cbz"), 1);
        write_book(&comics.path().join(SERIES_01).join("v02.cbz"), 2);
        write_book(&comics.path().join(SERIES_02).join("v01.cbz"), 3);
        let (scanned, _, _) = Scanned::folder(name, comics.path()).await;
        Self { scanned, comics }
    }

    fn path(&self, location: &str) -> PathBuf {
        self.comics.path().join(location)
    }

    async fn rescan(&self) -> (FolderRescan, Vec<ScanProgress>) {
        let mut progress = Vec::new();
        let rescan = self
            .scanned
            .library
            .rescan_folder(self.scanned.id, |step| progress.push(step))
            .await
            .unwrap();
        (rescan, progress)
    }

    async fn changes(&self) -> RescanOutcome {
        self.rescan().await.0.outcome
    }

    fn book_ids_in(&self, title: &str) -> Vec<BookId> {
        let connection = self.scanned.connection();
        let series = series_page(&connection, SeriesOrder::Title, &whole_page())
            .unwrap()
            .items
            .into_iter()
            .find(|series| series.title == title)
            .unwrap();
        series_books(&connection, series.id, &whole_page())
            .unwrap()
            .items
            .into_iter()
            .map(|book| book.id)
            .collect()
    }

    /// Writes through a store of its own on the library's database, as reading a book would.
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
        folder_listed(&self.scanned.library, &self.scanned)
            .await
            .unwrap()
    }
}

async fn folder_listed(library: &Library, scanned: &Scanned) -> Option<LibraryFolder> {
    library
        .folders(None)
        .await
        .unwrap()
        .folders
        .into_iter()
        .find(|folder| folder.id == scanned.id)
}

/// Gives a changed file a modification time no earlier write shares, so a rescan can't mistake it for the old one.
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

#[tokio::test]
async fn finds_nothing_changed_when_no_file_did() {
    let folder = Rescanned::new("rescan-unchanged").await;

    let (rescan, progress) = folder.rescan().await;

    assert_eq!(rescan.outcome, rescanned(FileChanges::default()));
    assert_eq!(rescan.name, folder.folder().await.name);
    assert_eq!(
        progress,
        [
            ScanProgress::Finding,
            ScanProgress::Reading {
                scanned: 0,
                total: 0
            }
        ]
    );
}

#[tokio::test]
async fn finds_nothing_changed_in_an_unchanged_folder_of_images() {
    let comics = TempFolder::new("rescan-images").with_files(&["Sample Series 01/notes.txt"]);
    write_page(&comics.path().join(SERIES_01).join("Ch 01"), 1);
    let (scanned, _, _) = Scanned::folder("rescan-images", comics.path()).await;

    let rescan = scanned
        .library
        .rescan_folder(scanned.id, |_| {})
        .await
        .unwrap();

    assert_eq!(rescan.outcome, rescanned(FileChanges::default()));
}

#[tokio::test]
async fn adds_a_book_whose_file_appeared() {
    let folder = Rescanned::new("rescan-added").await;
    write_book(&folder.path("Sample Series 03/v01.cbz"), 4);

    let (rescan, progress) = folder.rescan().await;

    assert_eq!(
        rescan.outcome,
        rescanned(FileChanges {
            added: 1,
            ..FileChanges::default()
        })
    );
    assert_eq!(
        folder.scanned.series(),
        owned(&[(SERIES_01, 2), (SERIES_02, 1), (SERIES_03, 1)])
    );
    assert_eq!(
        progress.last(),
        Some(&ScanProgress::Reading {
            scanned: 1,
            total: 1
        })
    );
}

#[tokio::test]
async fn updates_a_book_whose_file_changed_but_still_holds_the_same_pages() {
    let folder = Rescanned::new("rescan-modified").await;
    let before = folder.book_ids_in(SERIES_01);
    let edited = folder.path("Sample Series 01/v01.cbz");
    write_book_with(
        &edited,
        1,
        Some("<ComicInfo><Title>Sample Story</Title></ComicInfo>"),
    );
    mark_changed(&edited);

    let outcome = folder.changes().await;

    assert_eq!(
        outcome,
        rescanned(FileChanges {
            updated: 1,
            ..FileChanges::default()
        })
    );
    assert_eq!(folder.book_ids_in(SERIES_01), before);
}

#[tokio::test]
async fn follows_a_renamed_file_and_keeps_its_book() {
    let folder = Rescanned::new("rescan-renamed").await;
    let before = folder.book_ids_in(SERIES_01);
    let renamed = *before.first().unwrap();
    folder.set_position(renamed, 5).await;
    fs::rename(
        folder.path("Sample Series 01/v01.cbz"),
        folder.path("Sample Series 01/v01 (fixed).cbz"),
    )
    .unwrap();

    let outcome = folder.changes().await;

    assert_eq!(
        outcome,
        rescanned(FileChanges {
            moved: 1,
            ..FileChanges::default()
        })
    );
    assert_eq!(folder.scanned.books_in(SERIES_01), ["v01 (fixed)", "v02"]);
    assert_eq!(folder.book_ids_in(SERIES_01), before);
    assert_eq!(folder.position_of(renamed), Some(5));
}

#[tokio::test]
async fn files_a_book_moved_to_another_series_folder_in_that_series() {
    let folder = Rescanned::new("rescan-moved").await;
    let moved = *folder.book_ids_in(SERIES_01).last().unwrap();
    fs::rename(
        folder.path("Sample Series 01/v02.cbz"),
        folder.path("Sample Series 02/v02.cbz"),
    )
    .unwrap();

    let outcome = folder.changes().await;

    assert_eq!(
        outcome,
        rescanned(FileChanges {
            moved: 1,
            ..FileChanges::default()
        })
    );
    assert_eq!(
        folder.scanned.series(),
        owned(&[(SERIES_01, 1), (SERIES_02, 2)])
    );
    assert!(folder.book_ids_in(SERIES_02).contains(&moved));
}

#[tokio::test]
async fn counts_a_copy_as_added_while_the_original_stays() {
    let folder = Rescanned::new("rescan-copied").await;
    fs::copy(
        folder.path("Sample Series 01/v01.cbz"),
        folder.path("Sample Series 01/v01 copy.cbz"),
    )
    .unwrap();

    let outcome = folder.changes().await;

    assert_eq!(
        outcome,
        rescanned(FileChanges {
            added: 1,
            ..FileChanges::default()
        })
    );
    assert_eq!(folder.scanned.books_in(SERIES_01), ["v01", "v02"]);
}

#[tokio::test]
async fn removes_no_book_when_a_copy_of_one_is_deleted() {
    let folder = Rescanned::new("rescan-copy-deleted").await;
    let copy = folder.path("Sample Series 01/v01 copy.cbz");
    fs::copy(folder.path("Sample Series 01/v01.cbz"), &copy).unwrap();
    folder.rescan().await;
    fs::remove_file(&copy).unwrap();

    let outcome = folder.changes().await;

    assert_eq!(outcome, rescanned(FileChanges::default()));
    assert_eq!(folder.scanned.books_in(SERIES_01), ["v01", "v02"]);
}

#[tokio::test]
async fn swaps_the_book_of_a_file_replaced_by_other_content() {
    let folder = Rescanned::new("rescan-replaced").await;
    let before = folder.book_ids_in(SERIES_01);
    let replaced = folder.path("Sample Series 01/v01.cbz");
    write_book(&replaced, 9);
    mark_changed(&replaced);

    let outcome = folder.changes().await;

    let after = folder.book_ids_in(SERIES_01);
    assert_eq!(
        outcome,
        rescanned(FileChanges {
            updated: 1,
            ..FileChanges::default()
        })
    );
    assert_eq!(folder.scanned.books_in(SERIES_01), ["v01", "v02"]);
    assert!(!after.contains(before.first().unwrap()));
    assert_eq!(after.get(1), before.get(1));
}

#[tokio::test]
async fn carries_the_reading_state_of_a_replaced_file_to_the_book_now_there() {
    let folder = Rescanned::new("rescan-replaced-state").await;
    let before = folder.book_ids_in(SERIES_01);
    folder.set_position(*before.first().unwrap(), 6).await;
    let replaced = folder.path("Sample Series 01/v01.cbz");
    write_book(&replaced, 9);
    mark_changed(&replaced);

    folder.rescan().await;

    let now_there = *folder.book_ids_in(SERIES_01).first().unwrap();
    assert!(!before.contains(&now_there));
    assert_eq!(folder.position_of(now_there), Some(6));
}

#[tokio::test]
async fn keeps_its_own_reading_state_for_a_known_book_renamed_over_another() {
    let folder = Rescanned::new("rescan-renamed-over").await;
    let before = folder.book_ids_in(SERIES_01);
    let (overwritten, renamed) = (*before.first().unwrap(), *before.last().unwrap());
    folder.set_position(overwritten, 6).await;
    folder.set_position(renamed, 11).await;
    let kept = folder.path("Sample Series 01/v01.cbz");
    fs::rename(folder.path("Sample Series 01/v02.cbz"), &kept).unwrap();
    mark_changed(&kept);

    folder.rescan().await;

    assert_eq!(folder.book_ids_in(SERIES_01), [renamed]);
    assert_eq!(folder.position_of(renamed), Some(11));
}

#[tokio::test]
async fn removes_a_book_whose_file_is_gone_and_a_series_left_without_books() {
    let folder = Rescanned::new("rescan-deleted").await;
    fs::remove_file(folder.path("Sample Series 02/v01.cbz")).unwrap();

    let outcome = folder.changes().await;

    assert_eq!(
        outcome,
        rescanned(FileChanges {
            removed: 1,
            ..FileChanges::default()
        })
    );
    assert_eq!(folder.scanned.series(), owned(&[(SERIES_01, 2)]));
}

#[tokio::test]
async fn brings_a_book_back_under_its_old_id_when_its_file_returns() {
    let folder = Rescanned::new("rescan-returned").await;
    let before = folder.book_ids_in(SERIES_02);
    let returning_book = *before.first().unwrap();
    folder.set_position(returning_book, 8).await;
    let returning = folder.path("Sample Series 02/v01.cbz");
    fs::remove_file(&returning).unwrap();
    folder.rescan().await;
    write_book(&returning, 3);

    let outcome = folder.changes().await;

    assert_eq!(
        outcome,
        rescanned(FileChanges {
            added: 1,
            ..FileChanges::default()
        })
    );
    assert_eq!(folder.book_ids_in(SERIES_02), before);
    assert_eq!(folder.position_of(returning_book), Some(8));
}

#[tokio::test]
async fn keeps_a_book_whose_file_can_no_longer_be_read() {
    let folder = Rescanned::new("rescan-damaged").await;
    let damaged = folder.path("Sample Series 01/v02.cbz");
    fs::write(&damaged, b"not a comic").unwrap();
    mark_changed(&damaged);

    let outcome = folder.changes().await;

    assert_eq!(
        outcome,
        rescanned(FileChanges {
            unreadable_books: 1,
            ..FileChanges::default()
        })
    );
    assert_eq!(folder.scanned.books_in(SERIES_01), ["v01", "v02"]);
}

#[tokio::test]
async fn keeps_every_book_of_a_folder_it_cannot_reach_and_marks_it_unavailable() {
    let folder = Rescanned::new("rescan-unreachable").await;
    let unplugged = folder.comics.path().with_extension("unplugged");
    fs::rename(folder.comics.path(), &unplugged).unwrap();

    let outcome = folder.changes().await;

    fs::rename(&unplugged, folder.comics.path()).unwrap();
    assert_eq!(outcome, RescanOutcome::Unreachable);
    assert_eq!(
        folder.scanned.series(),
        owned(&[(SERIES_01, 2), (SERIES_02, 1)])
    );
    assert!(!folder.folder().await.is_available);
}

#[tokio::test]
async fn keeps_every_book_of_a_folder_found_empty_and_marks_it_unavailable() {
    let folder = Rescanned::new("rescan-found-empty").await;
    for series in [SERIES_01, SERIES_02] {
        fs::remove_dir_all(folder.path(series)).unwrap();
    }

    let outcome = folder.changes().await;

    assert_eq!(outcome, RescanOutcome::FoundEmpty);
    assert_eq!(
        folder.scanned.series(),
        owned(&[(SERIES_01, 2), (SERIES_02, 1)])
    );
    assert!(!folder.folder().await.is_available);
}

#[tokio::test]
async fn removes_the_last_book_gone_from_the_home_folder_since_the_library_lives_there() {
    let folder = Rescanned::new("rescan-home-emptied").await;
    let library = &folder.scanned.library;
    let home = library
        .folders(None)
        .await
        .unwrap()
        .folders
        .first()
        .unwrap()
        .clone();
    let kept_at_home = folder.scanned.home.path().join("v01.cbz");
    write_book(&kept_at_home, 7);
    library.rescan_folder(home.id, |_| {}).await.unwrap();
    fs::remove_file(&kept_at_home).unwrap();

    let rescan = library.rescan_folder(home.id, |_| {}).await.unwrap();

    assert_eq!(
        rescan.outcome,
        rescanned(FileChanges {
            removed: 1,
            ..FileChanges::default()
        })
    );
    assert!(
        library
            .folders(None)
            .await
            .unwrap()
            .folders
            .first()
            .unwrap()
            .is_available
    );
}

#[tokio::test]
async fn reads_a_folder_holding_only_files_that_are_not_books_as_found_empty() {
    let folder = Rescanned::new("rescan-only-notes").await;
    for series in [SERIES_01, SERIES_02] {
        fs::remove_dir_all(folder.path(series)).unwrap();
    }
    fs::write(folder.path("notes.txt"), b"").unwrap();

    let outcome = folder.changes().await;

    assert_eq!(outcome, RescanOutcome::FoundEmpty);
}

#[tokio::test]
async fn marks_a_folder_available_again_once_a_rescan_reaches_it() {
    let folder = Rescanned::new("rescan-reachable-again").await;
    let unplugged = folder.comics.path().with_extension("unplugged");
    fs::rename(folder.comics.path(), &unplugged).unwrap();
    folder.rescan().await;
    fs::rename(&unplugged, folder.comics.path()).unwrap();

    let outcome = folder.changes().await;

    assert_eq!(outcome, rescanned(FileChanges::default()));
    assert!(folder.folder().await.is_available);
}

#[tokio::test]
async fn marks_a_folder_available_again_once_it_is_added_again() {
    let folder = Rescanned::new("rescan-added-again").await;
    let unplugged = folder.comics.path().with_extension("unplugged");
    fs::rename(folder.comics.path(), &unplugged).unwrap();
    folder.rescan().await;
    fs::rename(&unplugged, folder.comics.path()).unwrap();

    folder
        .scanned
        .library
        .add_folder(folder.comics.path().to_path_buf(), |_| {})
        .await
        .unwrap();

    assert!(folder.folder().await.is_available);
}

#[tokio::test]
async fn finds_nothing_changed_in_a_folder_that_never_held_books() {
    let comics = TempFolder::new("rescan-never-held-books");
    let (scanned, _, _) = Scanned::folder("rescan-never-held-books", comics.path()).await;

    let rescan = scanned
        .library
        .rescan_folder(scanned.id, |_| {})
        .await
        .unwrap();

    assert_eq!(rescan.outcome, rescanned(FileChanges::default()));
    assert!(
        folder_listed(&scanned.library, &scanned)
            .await
            .unwrap()
            .is_available
    );
}

#[cfg(unix)]
#[tokio::test]
async fn keeps_the_books_under_a_subfolder_it_cannot_read() {
    use std::os::unix::fs::PermissionsExt;
    let folder = Rescanned::new("rescan-locked").await;
    let locked = folder.path(SERIES_02);
    fs::set_permissions(&locked, fs::Permissions::from_mode(0o000)).unwrap();

    let outcome = folder.changes().await;

    fs::set_permissions(&locked, fs::Permissions::from_mode(0o755)).unwrap();
    assert_eq!(
        outcome,
        rescanned(FileChanges {
            unreadable_folders: 1,
            ..FileChanges::default()
        })
    );
    assert_eq!(
        folder.scanned.series(),
        owned(&[(SERIES_01, 2), (SERIES_02, 1)])
    );
}

#[tokio::test]
async fn rescans_the_home_folder_and_every_linked_folder_in_the_order_they_were_added() {
    let folder = Rescanned::new("rescan-every-folder").await;
    fs::remove_file(folder.path("Sample Series 02/v01.cbz")).unwrap();
    let listed: Vec<_> = folder
        .scanned
        .library
        .folders(None)
        .await
        .unwrap()
        .folders
        .into_iter()
        .map(|folder| folder.id)
        .collect();

    let rescans = folder.scanned.library.rescan_folders().await.unwrap();

    assert_eq!(
        rescans.iter().map(|rescan| rescan.id).collect::<Vec<_>>(),
        listed
    );
    assert_eq!(
        rescans.last().map(|rescan| rescan.outcome.clone()),
        Some(rescanned(FileChanges {
            removed: 1,
            ..FileChanges::default()
        }))
    );
}

/// Removes a folder once the rescan has listed it and recorded the first batch of the home folder's books, so the removal lands mid-rescan.
#[tokio::test]
async fn rescans_the_folders_after_one_removed_while_the_rescan_runs() {
    const HOME_BOOKS: u64 = 40;
    let folder = Rescanned::new("rescan-removed-meanwhile").await;
    let library = &folder.scanned.library;
    let later = TempFolder::new("rescan-removed-meanwhile-later");
    write_book(&later.path().join(SERIES_03).join("v01.cbz"), 4);
    write_book(&later.path().join(SERIES_03).join("v02.cbz"), 5);
    library
        .add_folder(later.path().to_path_buf(), |_| {})
        .await
        .unwrap();
    let later_id = library
        .folders(None)
        .await
        .unwrap()
        .folders
        .last()
        .unwrap()
        .id;
    fs::remove_file(later.path().join(SERIES_03).join("v02.cbz")).unwrap();
    for number in 1..=HOME_BOOKS {
        let one_shot = folder.scanned.home.path().join(format!("v{number:02}.cbz"));
        write_book(&one_shot, 10 + number);
    }
    let series_before = folder.scanned.series().len();

    let (rescans, removed) = tokio::join!(library.rescan_folders(), async {
        while folder.scanned.series().len() == series_before {
            tokio::task::yield_now().await;
        }
        library.remove_folder(folder.scanned.id).await
    });

    removed.unwrap();
    let later_rescan = rescans
        .unwrap()
        .into_iter()
        .find(|rescan| rescan.id == later_id)
        .map(|rescan| rescan.outcome);
    assert_eq!(
        later_rescan,
        Some(rescanned(FileChanges {
            removed: 1,
            ..FileChanges::default()
        }))
    );
}

#[test]
fn tells_the_interface_what_a_rescan_found_by_kind() {
    let outcomes = [
        rescanned(FileChanges {
            added: 1,
            updated: 2,
            moved: 3,
            removed: 4,
            unreadable_books: 5,
            unreadable_folders: 6,
        }),
        RescanOutcome::Unreachable,
        RescanOutcome::FoundEmpty,
    ];

    let sent = outcomes.map(|outcome| serde_json::to_value(outcome).unwrap());

    assert_eq!(
        sent,
        [
            serde_json::json!({
                "kind": "rescanned",
                "added": 1,
                "updated": 2,
                "moved": 3,
                "removed": 4,
                "unreadableBooks": 5,
                "unreadableFolders": 6,
            }),
            serde_json::json!({ "kind": "unreachable" }),
            serde_json::json!({ "kind": "foundEmpty" }),
        ]
    );
}
