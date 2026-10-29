#![expect(
    clippy::unwrap_used,
    reason = "each test removes books from its own generated folder in a scratch library, so a failed set-up should stop the test"
)]

mod books;
mod disposal;
#[expect(
    dead_code,
    reason = "these tests count the books of each series, never read their titles"
)]
mod scanned;
mod support;

use std::{
    collections::HashSet,
    fmt,
    fs::{self, File},
    future::poll_fn,
    io,
    path::{Path, PathBuf},
    pin::pin,
    sync::{
        Arc, Mutex,
        atomic::{AtomicUsize, Ordering},
        mpsc,
    },
    task::Poll,
    time::{Duration, SystemTime},
};

use books::{write_book, write_page};
#[cfg(unix)]
use disposal::DiskDisposal;
use disposal::{FakeDisposal, Pause, VanishingDisposal};
use omnileaf_engine::{
    AndroidTree, BookId, Disposal, DisposalFailure, FileDisposal, FileFate, FileOutcome,
    FileRemoval, Library, LibraryListing, OpenTree, RemovalFailure, RemovalReport, RemovalTarget,
    RootLocator, SeriesBookListing, SeriesId, TreeUri,
};
use omnileaf_formats::{Details, Entry, LocalStorage, Storage};
use scanned::{Scanned, owned};
use support::{FixedClock, ScratchFolder};
use tokio::{
    runtime::Builder,
    select,
    sync::Notify,
    task::spawn_blocking,
    time::{advance, timeout},
};

const SERIES_01: &str = "Sample Series 01";
const SERIES_02: &str = "Sample Series 02";
const SERIES_03: &str = "Sample Series 03";
const LONG_ENOUGH_TO_REMOVE: Duration = Duration::from_millis(300);
const COMICS_TREE: &str = "content://documents.test/tree/primary%3ADocuments%2FComics";
const TREE_NAME: &str = "Comics";
const PAST_ANY_LIMIT: Duration = Duration::from_secs(600);
const SLOWER_THAN_A_LISTING: Duration = Duration::from_secs(10);
const STALLED_AT_MOST: Duration = Duration::from_secs(5);
const CHANGED_AT: Duration = Duration::from_secs(1_800_000_001);

struct Deleting {
    scanned: Scanned,
    comics: ScratchFolder,
}

impl Deleting {
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

    fn markers(&self) -> u32 {
        self.scanned
            .connection()
            .query_row("SELECT count(*) FROM book_removed", [], |row| row.get(0))
            .unwrap()
    }

    async fn delete(
        &self,
        targets: &[RemovalTarget],
        disposal: &impl FileDisposal,
    ) -> RemovalReport {
        self.scanned
            .library
            .remove_from_library(targets, FileFate::Dispose(disposal))
            .await
            .unwrap()
    }
}

fn by_name(mut files: Vec<FileRemoval>) -> Vec<(String, FileOutcome)> {
    files.sort_by(|left, right| left.name.cmp(&right.name));
    files
        .into_iter()
        .map(|file| (file.name, file.outcome))
        .collect()
}

#[tokio::test]
async fn deleting_files_reports_each_file_trashed_with_a_fake_disposal() {
    let deleting = Deleting::new("delete-trashed").await;
    let series = deleting.series(SERIES_01).await;
    let disposal = FakeDisposal::default();

    let report = deleting
        .delete(&[RemovalTarget::Series { id: series }], &disposal)
        .await;

    assert_eq!(
        by_name(report.files),
        [
            ("v01.cbz".to_owned(), FileOutcome::Trashed),
            ("v02.cbz".to_owned(), FileOutcome::Trashed),
        ]
    );
    assert_eq!(
        disposal.calls(),
        [
            deleting.path("Sample Series 01/v01.cbz"),
            deleting.path("Sample Series 01/v02.cbz")
        ]
    );
}

fn failed(reason: RemovalFailure) -> FileOutcome {
    FileOutcome::Failed { reason }
}

#[tokio::test]
async fn a_file_that_cannot_be_deleted_stays_and_never_undoes_the_library_removal() {
    let deleting = Deleting::new("delete-refused").await;
    let series = deleting.series(SERIES_01).await;
    let disposal =
        FakeDisposal::default().replying("v01.cbz", Err(DisposalFailure::PermissionDenied));

    let report = deleting
        .delete(&[RemovalTarget::Series { id: series }], &disposal)
        .await;

    assert_eq!(
        by_name(report.files),
        [
            (
                "v01.cbz".to_owned(),
                failed(RemovalFailure::PermissionDenied)
            ),
            ("v02.cbz".to_owned(), FileOutcome::Trashed),
        ]
    );
    assert_eq!(deleting.scanned.series(), owned(&[(SERIES_02, 1)]));
    assert_eq!(deleting.markers(), 2);
}

#[tokio::test]
async fn a_locked_file_is_reported_locked_and_the_others_still_go() {
    let deleting = Deleting::new("delete-locked").await;
    let series = deleting.series(SERIES_01).await;
    let disposal = FakeDisposal::default().replying("v01.cbz", Err(DisposalFailure::Locked));

    let report = deleting
        .delete(&[RemovalTarget::Series { id: series }], &disposal)
        .await;

    assert_eq!(
        by_name(report.files),
        [
            ("v01.cbz".to_owned(), failed(RemovalFailure::Locked)),
            ("v02.cbz".to_owned(), FileOutcome::Trashed),
        ]
    );
}

#[tokio::test]
async fn a_file_with_no_trash_to_go_to_is_reported_deleted() {
    let deleting = Deleting::new("delete-no-trash").await;
    let book = deleting.books(SERIES_02).await[0];
    let disposal = FakeDisposal::default().replying("v01.cbz", Ok(Disposal::Deleted));

    let report = deleting
        .delete(&[RemovalTarget::Book { id: book }], &disposal)
        .await;

    assert_eq!(
        by_name(report.files),
        [("v01.cbz".to_owned(), FileOutcome::Deleted)]
    );
}

#[tokio::test]
async fn a_file_that_vanishes_while_it_is_removed_counts_as_missing() {
    let deleting = Deleting::new("delete-vanished").await;
    let book = deleting.books(SERIES_02).await[0];

    let report = deleting
        .delete(&[RemovalTarget::Book { id: book }], &VanishingDisposal)
        .await;

    assert_eq!(
        by_name(report.files),
        [("v01.cbz".to_owned(), FileOutcome::Missing)]
    );
}

#[tokio::test]
async fn a_disposal_that_says_not_found_for_a_file_still_on_disk_reports_it_failed() {
    let deleting = Deleting::new("delete-not-found-but-there").await;
    let book = deleting.books(SERIES_02).await[0];
    let disposal = FakeDisposal::default().replying("v01.cbz", Err(DisposalFailure::NotFound));

    let report = deleting
        .delete(&[RemovalTarget::Book { id: book }], &disposal)
        .await;

    assert_eq!(
        by_name(report.files),
        [("v01.cbz".to_owned(), failed(RemovalFailure::Other))]
    );
    assert!(deleting.path("Sample Series 02/v01.cbz").is_file());
}

#[tokio::test]
async fn a_place_that_cannot_have_files_removed_is_reported_unsupported() {
    let deleting = Deleting::new("delete-unsupported").await;
    let book = deleting.books(SERIES_02).await[0];
    let disposal = FakeDisposal::default().replying("v01.cbz", Err(DisposalFailure::Unsupported));

    let report = deleting
        .delete(&[RemovalTarget::Book { id: book }], &disposal)
        .await;

    assert_eq!(
        by_name(report.files),
        [(
            "v01.cbz".to_owned(),
            failed(RemovalFailure::UnsupportedLocation)
        )]
    );
}

#[tokio::test]
async fn a_file_that_fails_for_another_reason_is_reported_other() {
    let deleting = Deleting::new("delete-other").await;
    let book = deleting.books(SERIES_02).await[0];
    let disposal = FakeDisposal::default().replying("v01.cbz", Err(DisposalFailure::Other));

    let report = deleting
        .delete(&[RemovalTarget::Book { id: book }], &disposal)
        .await;

    assert_eq!(
        by_name(report.files),
        [("v01.cbz".to_owned(), failed(RemovalFailure::Other))]
    );
}

#[tokio::test]
async fn a_file_the_disk_no_longer_holds_counts_as_missing_and_as_success() {
    let deleting = Deleting::new("delete-missing").await;
    let series = deleting.series(SERIES_01).await;
    fs::remove_file(deleting.path("Sample Series 01/v02.cbz")).unwrap();
    let disposal = FakeDisposal::default();

    let report = deleting
        .delete(&[RemovalTarget::Series { id: series }], &disposal)
        .await;

    assert_eq!(
        by_name(report.files),
        [
            ("v01.cbz".to_owned(), FileOutcome::Trashed),
            ("v02.cbz".to_owned(), FileOutcome::Missing),
        ]
    );
    assert_eq!(
        disposal.calls(),
        [deleting.path("Sample Series 01/v01.cbz")]
    );
}

#[tokio::test]
async fn a_file_replaced_on_disk_since_the_scan_is_skipped_and_reported_failed() {
    let deleting = Deleting::new("delete-replaced").await;
    let series = deleting.series(SERIES_02).await;
    let replaced = deleting.path("Sample Series 02/v01.cbz");
    let scanned_at = fs::metadata(&replaced).unwrap().modified().unwrap();
    fs::write(&replaced, b"another book").unwrap();
    fs::File::options()
        .write(true)
        .open(&replaced)
        .unwrap()
        .set_modified(scanned_at)
        .unwrap();
    let disposal = FakeDisposal::default();

    let report = deleting
        .delete(&[RemovalTarget::Series { id: series }], &disposal)
        .await;

    assert_eq!(
        by_name(report.files),
        [("v01.cbz".to_owned(), failed(RemovalFailure::Other))]
    );
    assert_eq!(disposal.calls(), Vec::<PathBuf>::new());
    assert_eq!(fs::read(&replaced).unwrap(), b"another book");
}

#[tokio::test]
async fn a_file_touched_since_the_scan_is_skipped_and_reported_failed() {
    let deleting = Deleting::new("delete-touched").await;
    let series = deleting.series(SERIES_02).await;
    fs::File::options()
        .write(true)
        .open(deleting.path("Sample Series 02/v01.cbz"))
        .unwrap()
        .set_modified(SystemTime::UNIX_EPOCH + CHANGED_AT)
        .unwrap();
    let disposal = FakeDisposal::default();

    let report = deleting
        .delete(&[RemovalTarget::Series { id: series }], &disposal)
        .await;

    assert_eq!(
        by_name(report.files),
        [("v01.cbz".to_owned(), failed(RemovalFailure::Other))]
    );
    assert_eq!(disposal.calls(), Vec::<PathBuf>::new());
}

async fn scanned_folder_book(name: &str) -> (Deleting, PathBuf) {
    let comics = ScratchFolder::new(name);
    let chapter = comics.path().join(SERIES_01).join("Ch 01");
    write_page(&chapter, 1);
    let (scanned, _, _) = Scanned::folder(name, comics.path()).await;
    (Deleting { scanned, comics }, chapter)
}

#[tokio::test]
async fn a_folder_book_left_as_scanned_is_disposed() {
    let (deleting, chapter) = scanned_folder_book("delete-folder-book-intact").await;
    let series = deleting.series(SERIES_01).await;
    let disposal = FakeDisposal::default();

    let report = deleting
        .delete(&[RemovalTarget::Series { id: series }], &disposal)
        .await;

    assert_eq!(
        by_name(report.files),
        [("Ch 01".to_owned(), FileOutcome::Trashed)]
    );
    assert_eq!(disposal.calls(), [chapter]);
}

#[tokio::test]
async fn a_page_rewritten_inside_a_folder_book_skips_the_book_though_the_folder_time_is_unchanged()
{
    let (deleting, chapter) = scanned_folder_book("delete-folder-book-rewritten").await;
    let series = deleting.series(SERIES_01).await;
    let scanned_at = fs::metadata(&chapter).unwrap().modified().unwrap();
    fs::write(chapter.join("001.png"), b"another page").unwrap();
    assert_eq!(
        fs::metadata(&chapter).unwrap().modified().unwrap(),
        scanned_at
    );
    let disposal = FakeDisposal::default();

    let report = deleting
        .delete(&[RemovalTarget::Series { id: series }], &disposal)
        .await;

    assert_eq!(
        by_name(report.files),
        [("Ch 01".to_owned(), failed(RemovalFailure::Other))]
    );
    assert_eq!(disposal.calls(), Vec::<PathBuf>::new());
    assert_eq!(fs::read(chapter.join("001.png")).unwrap(), b"another page");
}

struct StoredOutside {
    outcomes: Vec<(String, FileOutcome)>,
    disposal: FakeDisposal,
    file: PathBuf,
    _folders: Deleting,
}

impl StoredOutside {
    fn is_untouched(&self) -> bool {
        self.disposal.calls().is_empty() && self.file.is_file()
    }
}

#[cfg(unix)]
fn stored_bytes(location: &Path) -> Vec<u8> {
    use std::os::unix::ffi::OsStrExt;

    location.as_os_str().as_bytes().to_vec()
}

#[cfg(windows)]
fn stored_bytes(location: &Path) -> Vec<u8> {
    use std::os::windows::ffi::OsStrExt;

    location
        .as_os_str()
        .encode_wide()
        .flat_map(u16::to_le_bytes)
        .collect()
}

async fn removing_a_file_stored_at(
    name: &str,
    stored_location: impl FnOnce(&Path) -> PathBuf,
) -> StoredOutside {
    let outer = ScratchFolder::new(name);
    let library_folder = outer.path().join("library");
    write_book(&library_folder.join(SERIES_02).join("v01.cbz"), 3);
    let (scanned, _, _) = Scanned::folder(name, &library_folder).await;
    let outside = outer.path().join("outside.cbz");
    fs::rename(library_folder.join(SERIES_02).join("v01.cbz"), &outside).unwrap();
    let stored = stored_location(&outside);
    omnileaf_db::rusqlite::Connection::open(scanned.home.path().join("library.sqlite"))
        .unwrap()
        .execute(
            "UPDATE book_file SET location = ?1",
            [stored_bytes(&stored)],
        )
        .unwrap();
    let folders = Deleting {
        scanned,
        comics: outer,
    };
    let series = folders.series(SERIES_02).await;
    let disposal = FakeDisposal::default();

    let report = folders
        .delete(&[RemovalTarget::Series { id: series }], &disposal)
        .await;

    StoredOutside {
        outcomes: by_name(report.files),
        disposal,
        file: outside,
        _folders: folders,
    }
}

#[tokio::test]
async fn a_stored_location_climbing_out_of_the_root_is_refused_and_the_file_outside_stays() {
    let removal =
        removing_a_file_stored_at("delete-climbing", |_| PathBuf::from("../outside.cbz")).await;

    assert_eq!(
        removal.outcomes,
        [("outside.cbz".to_owned(), failed(RemovalFailure::Other))]
    );
    assert!(removal.is_untouched());
}

#[tokio::test]
async fn a_stored_location_ending_in_a_parent_step_is_named_by_that_step_alone() {
    let removal = removing_a_file_stored_at("delete-parent-step", |_| {
        PathBuf::from(SERIES_02).join("..")
    })
    .await;

    assert_eq!(
        removal.outcomes,
        [("..".to_owned(), failed(RemovalFailure::Other))]
    );
    assert!(removal.is_untouched());
}

#[tokio::test]
async fn an_empty_stored_location_is_refused_and_the_root_folder_stays() {
    let removal = removing_a_file_stored_at("delete-empty", |_| PathBuf::new()).await;

    assert_eq!(
        removal.outcomes,
        [(String::new(), failed(RemovalFailure::Other))]
    );
    assert!(removal.is_untouched());
}

#[tokio::test]
async fn an_absolute_stored_location_is_refused_and_the_file_it_names_stays() {
    let removal = removing_a_file_stored_at("delete-absolute", Path::to_path_buf).await;

    assert_eq!(
        removal.outcomes,
        [("outside.cbz".to_owned(), failed(RemovalFailure::Other))]
    );
    assert!(removal.is_untouched());
}

#[tokio::test]
async fn a_root_that_is_unplugged_reports_its_files_failed_not_missing() {
    let deleting = Deleting::new("delete-unplugged").await;
    let series = deleting.series(SERIES_01).await;
    fs::remove_dir_all(deleting.comics.path()).unwrap();
    let disposal = FakeDisposal::default();

    let report = deleting
        .delete(&[RemovalTarget::Series { id: series }], &disposal)
        .await;

    assert_eq!(
        by_name(report.files),
        [
            (
                "v01.cbz".to_owned(),
                failed(RemovalFailure::UnsupportedLocation)
            ),
            (
                "v02.cbz".to_owned(),
                failed(RemovalFailure::UnsupportedLocation)
            ),
        ]
    );
    assert_eq!(disposal.calls(), Vec::<PathBuf>::new());
}

#[tokio::test]
async fn an_unplugged_root_fails_only_its_own_files_while_another_root_is_still_removed() {
    let deleting = Deleting::new("delete-one-unplugged").await;
    let plugged = ScratchFolder::new("delete-one-unplugged-other");
    write_book(&plugged.path().join(SERIES_03).join("w01.cbz"), 4);
    deleting
        .scanned
        .library
        .add_folder(plugged.path().to_path_buf(), |_| {})
        .await
        .unwrap();
    let targets = [
        RemovalTarget::Series {
            id: deleting.series(SERIES_01).await,
        },
        RemovalTarget::Series {
            id: deleting.series(SERIES_03).await,
        },
    ];
    fs::remove_dir_all(deleting.comics.path()).unwrap();
    let disposal = FakeDisposal::default();

    let report = deleting.delete(&targets, &disposal).await;

    assert_eq!(
        by_name(report.files),
        [
            (
                "v01.cbz".to_owned(),
                failed(RemovalFailure::UnsupportedLocation)
            ),
            (
                "v02.cbz".to_owned(),
                failed(RemovalFailure::UnsupportedLocation)
            ),
            ("w01.cbz".to_owned(), FileOutcome::Trashed),
        ]
    );
    assert_eq!(
        disposal.calls(),
        [plugged.path().join("Sample Series 03/w01.cbz")]
    );
}

#[tokio::test]
async fn a_root_left_as_an_empty_mount_point_reports_its_files_failed_not_missing() {
    let deleting = Deleting::new("delete-mount-point").await;
    let series = deleting.series(SERIES_01).await;
    for entry in fs::read_dir(deleting.comics.path()).unwrap() {
        fs::remove_dir_all(entry.unwrap().path()).unwrap();
    }
    let disposal = FakeDisposal::default();

    let report = deleting
        .delete(&[RemovalTarget::Series { id: series }], &disposal)
        .await;

    assert_eq!(
        by_name(report.files),
        [
            (
                "v01.cbz".to_owned(),
                failed(RemovalFailure::UnsupportedLocation)
            ),
            (
                "v02.cbz".to_owned(),
                failed(RemovalFailure::UnsupportedLocation)
            ),
        ]
    );
}

#[tokio::test]
async fn removing_a_series_reports_every_file_of_its_books() {
    let deleting = Deleting::new("delete-series-books").await;
    let series = deleting.series(SERIES_01).await;
    let books: HashSet<BookId> = deleting.books(SERIES_01).await.into_iter().collect();

    let report = deleting
        .delete(
            &[RemovalTarget::Series { id: series }],
            &FakeDisposal::default(),
        )
        .await;

    let reported: HashSet<BookId> = report.files.iter().map(|file| file.book).collect();
    assert_eq!(reported, books);
    assert_eq!(report.removed_books, 2);
}

#[tokio::test]
async fn a_book_held_in_two_folders_reports_one_result_per_file() {
    let deleting = Deleting::new("delete-two-folders").await;
    let backup = ScratchFolder::new("delete-two-folders-backup");
    write_book(&backup.path().join(SERIES_02).join("v01.cbz"), 3);
    deleting
        .scanned
        .library
        .add_folder(backup.path().to_path_buf(), |_| {})
        .await
        .unwrap();
    let book = deleting.books(SERIES_02).await[0];
    let disposal = FakeDisposal::default();

    let report = deleting
        .delete(&[RemovalTarget::Book { id: book }], &disposal)
        .await;

    assert_eq!(
        by_name(report.files),
        [
            ("v01.cbz".to_owned(), FileOutcome::Trashed),
            ("v01.cbz".to_owned(), FileOutcome::Trashed),
        ]
    );
    let mut held = vec![
        deleting.path("Sample Series 02/v01.cbz"),
        backup.path().join("Sample Series 02/v01.cbz"),
    ];
    held.sort();
    assert_eq!(disposal.calls(), held);
}

#[tokio::test]
async fn keeping_the_files_removes_the_books_and_leaves_every_file_on_disk() {
    let deleting = Deleting::new("delete-off").await;
    let series = deleting.series(SERIES_01).await;

    let report = deleting
        .scanned
        .library
        .remove_from_library(&[RemovalTarget::Series { id: series }], FileFate::keep())
        .await
        .unwrap();

    assert_eq!(report.files, []);
    assert_eq!(report.removed_books, 2);
    assert!(deleting.path("Sample Series 01/v01.cbz").is_file());
    assert!(deleting.path("Sample Series 01/v02.cbz").is_file());
}

#[tokio::test]
async fn the_report_names_file_names_and_never_absolute_paths() {
    let deleting = Deleting::new("delete-names").await;
    let series = deleting.series(SERIES_01).await;

    let report = deleting
        .delete(
            &[RemovalTarget::Series { id: series }],
            &FakeDisposal::default(),
        )
        .await;

    let sent = serde_json::to_string(&report).unwrap();
    let comics = deleting.comics.path().to_str().unwrap();
    assert!(!sent.contains(comics), "{sent}");
    assert!(!sent.contains(SERIES_01), "{sent}");
}

struct Waited {
    pending_at_once: bool,
    pending_after_the_upper_bound: bool,
}

async fn waits_while_files_are_disposed(
    deleting: &Deleting,
    operation: impl Future<Output = ()>,
) -> Waited {
    let targets = [RemovalTarget::Series {
        id: deleting.series(SERIES_01).await,
    }];
    let pause = Pause::default();
    let disposal = FakeDisposal::default().pausing_on_the_first_file(&pause);
    let removal = deleting.delete(&targets, &disposal);
    let mut operation = pin!(operation);
    let waiting = async {
        pause.entered.notified().await;
        let pending_at_once =
            poll_fn(|cx| Poll::Ready(operation.as_mut().poll(cx).is_pending())).await;
        let pending_after_the_upper_bound = timeout(LONG_ENOUGH_TO_REMOVE, operation.as_mut())
            .await
            .is_err();
        pause.release.notify_one();
        operation.await;
        Waited {
            pending_at_once,
            pending_after_the_upper_bound,
        }
    };

    let (_, waited) = tokio::join!(removal, waiting);

    waited
}

#[tokio::test]
async fn the_library_lock_is_held_while_files_are_disposed_so_a_rescan_waits() {
    let deleting = Deleting::new("delete-lock-rescan").await;
    let library = &deleting.scanned.library;
    let folder = deleting.scanned.id;

    let waited = waits_while_files_are_disposed(&deleting, async {
        library.rescan_folder(folder, |_| {}).await.unwrap();
    })
    .await;

    assert!(waited.pending_at_once);
    assert!(waited.pending_after_the_upper_bound);
}

#[tokio::test]
async fn the_library_lock_is_held_while_files_are_disposed_so_an_added_folder_waits() {
    let deleting = Deleting::new("delete-lock-add").await;
    let library = &deleting.scanned.library;
    let comics = deleting.comics.path().to_path_buf();

    let waited = waits_while_files_are_disposed(&deleting, async {
        library.add_folder(comics, |_| {}).await.unwrap();
    })
    .await;

    assert!(waited.pending_at_once);
    assert!(waited.pending_after_the_upper_bound);
}

#[cfg(unix)]
struct Permissions {
    folder: PathBuf,
}

#[cfg(unix)]
impl Permissions {
    fn set(folder: PathBuf, mode: u32) -> Self {
        use std::os::unix::fs::PermissionsExt;

        fs::set_permissions(&folder, fs::Permissions::from_mode(mode)).unwrap();
        Self { folder }
    }
}

#[cfg(unix)]
impl Drop for Permissions {
    fn drop(&mut self) {
        use std::os::unix::fs::PermissionsExt;

        let restored = fs::set_permissions(&self.folder, fs::Permissions::from_mode(0o755));
        if !std::thread::panicking() {
            restored.unwrap();
        }
    }
}

#[cfg(unix)]
#[tokio::test]
async fn a_linked_folder_that_cannot_be_written_reports_permission_denied() {
    let deleting = Deleting::new("delete-read-only").await;
    let series = deleting.series(SERIES_02).await;
    let folder = deleting.path(SERIES_02);
    let _read_only = Permissions::set(folder.clone(), 0o555);
    if fs::write(folder.join("probe"), b"").is_ok() {
        skipped_as_privileged("a_linked_folder_that_cannot_be_written_reports_permission_denied");
        return;
    }

    let report = deleting
        .delete(&[RemovalTarget::Series { id: series }], &DiskDisposal)
        .await;

    assert_eq!(
        by_name(report.files),
        [(
            "v01.cbz".to_owned(),
            failed(RemovalFailure::PermissionDenied)
        )]
    );
    assert!(folder.join("v01.cbz").is_file());
}

#[cfg(unix)]
#[tokio::test]
async fn a_root_that_cannot_be_listed_reports_its_files_permission_denied_not_unsupported() {
    let deleting = Deleting::new("delete-unlistable").await;
    let series = deleting.series(SERIES_02).await;
    let _unlistable = Permissions::set(deleting.comics.path().to_path_buf(), 0o000);
    if fs::read_dir(deleting.comics.path()).is_ok() {
        skipped_as_privileged(
            "a_root_that_cannot_be_listed_reports_its_files_permission_denied_not_unsupported",
        );
        return;
    }
    let disposal = FakeDisposal::default();

    let report = deleting
        .delete(&[RemovalTarget::Series { id: series }], &disposal)
        .await;

    assert_eq!(
        by_name(report.files),
        [(
            "v01.cbz".to_owned(),
            failed(RemovalFailure::PermissionDenied)
        )]
    );
    assert_eq!(disposal.calls(), Vec::<PathBuf>::new());
}

#[cfg(unix)]
#[expect(
    clippy::print_stderr,
    reason = "a test run as a privileged user cannot make a folder unwritable, and says it did not run"
)]
fn skipped_as_privileged(test: &str) {
    eprintln!("skipped {test}: the user can use a folder made unusable");
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Call {
    Entries,
    Details,
    Remove,
}

struct Stall {
    call: Call,
    entered: Arc<Notify>,
    release: mpsc::Receiver<()>,
}

struct Crowd {
    entered: Arc<Notify>,
    release: mpsc::Receiver<()>,
}

struct Stalled {
    entered: Arc<Notify>,
    _release: mpsc::Sender<()>,
}

struct Tree {
    scratch: ScratchFolder,
    removes: bool,
    stall: Mutex<Option<Stall>>,
    crowd: Mutex<Option<Crowd>>,
    hanging_stat: Mutex<Option<Arc<Mutex<mpsc::Receiver<()>>>>>,
    entered_stat: Notify,
    stat_calls: AtomicUsize,
    failing_stat: Mutex<Option<io::ErrorKind>>,
    failing_removal: Mutex<Option<io::ErrorKind>>,
}

impl Tree {
    fn new(name: &str, removes: bool) -> Arc<Self> {
        Self::with_books(name, removes, 1)
    }

    fn with_books(name: &str, removes: bool, books: u64) -> Arc<Self> {
        let scratch = ScratchFolder::new(name);
        for seed in 3..3 + books {
            write_book(
                &scratch
                    .path()
                    .join(TREE_NAME)
                    .join(SERIES_02)
                    .join(format!("v{:02}.cbz", seed - 2)),
                seed,
            );
        }
        Arc::new(Self {
            scratch,
            removes,
            stall: Mutex::default(),
            crowd: Mutex::default(),
            hanging_stat: Mutex::default(),
            entered_stat: Notify::new(),
            stat_calls: AtomicUsize::new(0),
            failing_stat: Mutex::default(),
            failing_removal: Mutex::default(),
        })
    }

    fn on_device(&self, path: &Path) -> io::Result<PathBuf> {
        let inside = path
            .strip_prefix(TREE_NAME)
            .map_err(|_| io::Error::from(io::ErrorKind::NotFound))?;
        Ok(self.scratch.path().join(TREE_NAME).join(inside))
    }

    fn stalling_on(&self, call: Call) -> Stalled {
        let entered = Arc::new(Notify::new());
        let (release_sender, release) = mpsc::channel();
        *self.stall.lock().unwrap() = Some(Stall {
            call,
            entered: Arc::clone(&entered),
            release,
        });
        Stalled {
            entered,
            _release: release_sender,
        }
    }

    fn crowding_out_the_next_call_after_a_stat(&self) -> Stalled {
        let entered = Arc::new(Notify::new());
        let (release_sender, release) = mpsc::channel();
        *self.crowd.lock().unwrap() = Some(Crowd {
            entered: Arc::clone(&entered),
            release,
        });
        Stalled {
            entered,
            _release: release_sender,
        }
    }

    fn crowds_out_the_next_call_if_asked_to(&self) {
        let crowd = self.crowd.lock().unwrap().take();
        if let Some(crowd) = crowd {
            spawn_blocking(move || {
                crowd.entered.notify_one();
                crowd.release.recv_timeout(STALLED_AT_MOST).ok();
            });
        }
    }

    fn stats_never_answering(&self) -> mpsc::Sender<()> {
        let (release_sender, release) = mpsc::channel();
        *self.hanging_stat.lock().unwrap() = Some(Arc::new(Mutex::new(release)));
        release_sender
    }

    fn stat_calls(&self) -> usize {
        self.stat_calls.load(Ordering::SeqCst)
    }

    fn hangs_a_stat_if_asked_to(&self) {
        self.stat_calls.fetch_add(1, Ordering::SeqCst);
        let hanging = self.hanging_stat.lock().unwrap().clone();
        if let Some(release) = hanging {
            self.entered_stat.notify_one();
            release.lock().unwrap().recv_timeout(STALLED_AT_MOST).ok();
        }
    }

    fn refusing_removal_with(&self, kind: io::ErrorKind) {
        *self.failing_removal.lock().unwrap() = Some(kind);
    }

    fn failing_stats_with(&self, kind: io::ErrorKind) {
        *self.failing_stat.lock().unwrap() = Some(kind);
    }

    fn stalls_if_asked_to(&self, call: Call) {
        let stall = self
            .stall
            .lock()
            .unwrap()
            .take_if(|stall| stall.call == call);
        if let Some(stall) = stall {
            stall.entered.notify_one();
            stall.release.recv_timeout(STALLED_AT_MOST).ok();
        }
    }

    fn opener(self: &Arc<Self>) -> OpenTree {
        let tree = Arc::clone(self);
        Arc::new(move |_| Arc::clone(&tree) as Arc<dyn Storage>)
    }

    fn book(&self) -> PathBuf {
        self.scratch
            .path()
            .join(TREE_NAME)
            .join(SERIES_02)
            .join("v01.cbz")
    }
}

impl fmt::Debug for Tree {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.debug_struct("Tree").finish_non_exhaustive()
    }
}

impl Storage for Tree {
    fn entries(&self, folder: &Path) -> io::Result<Vec<Entry>> {
        self.stalls_if_asked_to(Call::Entries);
        LocalStorage.entries(&self.on_device(folder)?)
    }

    fn details(&self, path: &Path) -> io::Result<Details> {
        self.hangs_a_stat_if_asked_to();
        self.stalls_if_asked_to(Call::Details);
        if let Some(kind) = *self.failing_stat.lock().unwrap() {
            return Err(kind.into());
        }
        let details = LocalStorage.details(&self.on_device(path)?);
        self.crowds_out_the_next_call_if_asked_to();
        details
    }

    fn open(&self, file: &Path) -> io::Result<File> {
        LocalStorage.open(&self.on_device(file)?)
    }

    fn remove(&self, file: &Path) -> io::Result<()> {
        self.stalls_if_asked_to(Call::Remove);
        if !self.removes {
            return Err(io::ErrorKind::Unsupported.into());
        }
        if let Some(kind) = *self.failing_removal.lock().unwrap() {
            return Err(kind.into());
        }
        fs::remove_file(self.on_device(file)?)
    }
}

async fn library_reading(tree: &Arc<Tree>, name: &str) -> (Library, ScratchFolder) {
    let home = ScratchFolder::new(name);
    let library = Library::open(home.path().to_path_buf(), FixedClock)
        .await
        .unwrap()
        .reading_trees_with(tree.opener());
    let locator = RootLocator::AndroidTree(
        AndroidTree::new(
            TreeUri::parse(COMICS_TREE.to_owned()).unwrap(),
            TREE_NAME.to_owned(),
            "Internal storage › Documents".to_owned(),
        )
        .unwrap(),
    );
    library.add_folder(locator, |_| {}).await.unwrap();
    (library, home)
}

async fn only_book(library: &Library) -> BookId {
    let series = library
        .series(LibraryListing::default(), None)
        .await
        .unwrap()
        .series
        .remove(0)
        .id;
    library
        .series_books(series, SeriesBookListing::default(), None)
        .await
        .unwrap()
        .books
        .remove(0)
        .id
}

#[tokio::test]
async fn a_file_in_a_tree_goes_through_its_storage_and_never_the_disposal() {
    let tree = Tree::new("delete-tree", true);
    let (library, _home) = library_reading(&tree, "delete-tree-home").await;
    let book = only_book(&library).await;
    let disposal = FakeDisposal::default();

    let report = library
        .remove_from_library(
            &[RemovalTarget::Book { id: book }],
            FileFate::Dispose(&disposal),
        )
        .await
        .unwrap();

    assert_eq!(
        by_name(report.files),
        [("v01.cbz".to_owned(), FileOutcome::Deleted)]
    );
    assert_eq!(disposal.calls(), Vec::<PathBuf>::new());
    assert!(!tree.book().exists());
}

#[tokio::test]
async fn a_tree_that_cannot_remove_files_reports_them_unsupported_and_keeps_them() {
    let tree = Tree::new("delete-read-tree", false);
    let (library, _home) = library_reading(&tree, "delete-read-tree-home").await;
    let book = only_book(&library).await;

    let report = library
        .remove_from_library(
            &[RemovalTarget::Book { id: book }],
            FileFate::Dispose(&FakeDisposal::default()),
        )
        .await
        .unwrap();

    assert_eq!(
        by_name(report.files),
        [(
            "v01.cbz".to_owned(),
            failed(RemovalFailure::UnsupportedLocation)
        )]
    );
    assert!(tree.book().is_file());
}

#[tokio::test]
async fn a_refused_delete_reports_unsupported_location_through_the_engine() {
    let tree = Tree::new("delete-refused-tree", true);
    let (library, _home) = library_reading(&tree, "delete-refused-tree-home").await;
    let book = only_book(&library).await;
    tree.refusing_removal_with(io::ErrorKind::ReadOnlyFilesystem);

    let report = library
        .remove_from_library(
            &[RemovalTarget::Book { id: book }],
            FileFate::Dispose(&FakeDisposal::default()),
        )
        .await
        .unwrap();

    assert_eq!(
        by_name(report.files),
        [(
            "v01.cbz".to_owned(),
            failed(RemovalFailure::UnsupportedLocation)
        )]
    );
    assert!(tree.book().is_file());
}

#[tokio::test]
async fn a_tree_document_that_is_gone_counts_as_missing() {
    let tree = Tree::new("delete-gone-tree", true);
    let (library, _home) = library_reading(&tree, "delete-gone-tree-home").await;
    let book = only_book(&library).await;
    fs::remove_file(tree.book()).unwrap();
    let disposal = FakeDisposal::default();

    let report = library
        .remove_from_library(
            &[RemovalTarget::Book { id: book }],
            FileFate::Dispose(&disposal),
        )
        .await
        .unwrap();

    assert_eq!(
        by_name(report.files),
        [("v01.cbz".to_owned(), FileOutcome::Missing)]
    );
    assert_eq!(disposal.calls(), Vec::<PathBuf>::new());
}

async fn removing_the_tree_book_while_a_call_never_answers(
    name: &str,
    stuck_call: Call,
) -> (Vec<(String, FileOutcome)>, Arc<Tree>) {
    let tree = Tree::new(name, true);
    let (library, _home) = library_reading(&tree, &format!("{name}-home")).await;
    let book = only_book(&library).await;
    let stalled = tree.stalling_on(stuck_call);
    let disposal = FakeDisposal::default();
    let targets = [RemovalTarget::Book { id: book }];
    let removal = library.remove_from_library(&targets, FileFate::Dispose(&disposal));
    let giving_up = async {
        stalled.entered.notified().await;
        advance(PAST_ANY_LIMIT).await;
    };

    let (report, ()) = tokio::join!(removal, giving_up);

    assert_eq!(disposal.calls(), Vec::<PathBuf>::new());
    (by_name(report.unwrap().files), tree)
}

#[tokio::test]
async fn a_tree_whose_stat_fails_reports_the_failure_and_keeps_the_file() {
    let tree = Tree::new("delete-stat-fails", true);
    let (library, _home) = library_reading(&tree, "delete-stat-fails-home").await;
    let book = only_book(&library).await;
    tree.failing_stats_with(io::ErrorKind::PermissionDenied);

    let report = library
        .remove_from_library(
            &[RemovalTarget::Book { id: book }],
            FileFate::Dispose(&FakeDisposal::default()),
        )
        .await
        .unwrap();

    assert_eq!(
        by_name(report.files),
        [(
            "v01.cbz".to_owned(),
            failed(RemovalFailure::PermissionDenied)
        )]
    );
    assert!(tree.book().is_file());
}

#[tokio::test]
async fn files_of_an_already_removed_book_are_not_retried_by_a_later_delete() {
    let deleting = Deleting::new("delete-twice").await;
    let book = deleting.books(SERIES_02).await[0];
    let targets = [RemovalTarget::Book { id: book }];
    let first = deleting
        .scanned
        .library
        .remove_from_library(&targets, FileFate::keep())
        .await
        .unwrap();
    let disposal = FakeDisposal::default();

    let second = deleting.delete(&targets, &disposal).await;

    assert_eq!(first.removed_books, 1);
    assert_eq!(second.removed_books, 0);
    assert_eq!(second.files, []);
    assert_eq!(disposal.calls(), Vec::<PathBuf>::new());
    assert!(deleting.path("Sample Series 02/v01.cbz").is_file());
}

#[tokio::test(start_paused = true)]
async fn a_tree_whose_listing_never_answers_reports_its_files_unsupported_and_keeps_them() {
    let (files, tree) =
        removing_the_tree_book_while_a_call_never_answers("delete-stuck-listing", Call::Entries)
            .await;

    assert_eq!(
        files,
        [(
            "v01.cbz".to_owned(),
            failed(RemovalFailure::UnsupportedLocation)
        )]
    );
    assert!(tree.book().is_file());
}

#[tokio::test(start_paused = true)]
async fn a_tree_whose_stat_never_answers_reports_its_file_unsupported_and_keeps_it() {
    let (files, tree) =
        removing_the_tree_book_while_a_call_never_answers("delete-stuck-stat", Call::Details).await;

    assert_eq!(
        files,
        [(
            "v01.cbz".to_owned(),
            failed(RemovalFailure::UnsupportedLocation)
        )]
    );
    assert!(tree.book().is_file());
}

#[tokio::test(start_paused = true)]
async fn a_tree_whose_removal_never_answers_reports_its_file_failed_other() {
    let (files, _tree) =
        removing_the_tree_book_while_a_call_never_answers("delete-stuck-remove", Call::Remove)
            .await;

    assert_eq!(
        files,
        [("v01.cbz".to_owned(), failed(RemovalFailure::Other))]
    );
}

#[tokio::test(start_paused = true)]
async fn a_disposal_that_never_returns_fails_the_rest_of_its_root_and_frees_the_library() {
    let deleting = Deleting::new("delete-stuck-disposal").await;
    let series = deleting.series(SERIES_01).await;
    let disposal = FakeDisposal::default().hanging_on("v01.cbz");

    let report = deleting
        .delete(&[RemovalTarget::Series { id: series }], &disposal)
        .await;

    assert_eq!(
        by_name(report.files),
        [
            ("v01.cbz".to_owned(), failed(RemovalFailure::Other)),
            ("v02.cbz".to_owned(), failed(RemovalFailure::Other)),
        ]
    );
    assert_eq!(
        disposal.calls(),
        [deleting.path("Sample Series 01/v01.cbz")]
    );
    deleting
        .scanned
        .library
        .rescan_folder(deleting.scanned.id, |_| {})
        .await
        .unwrap();
}

fn on_a_single_blocking_thread(test: impl Future<Output = ()>) {
    Builder::new_current_thread()
        .enable_time()
        .start_paused(true)
        .max_blocking_threads(1)
        .build()
        .unwrap()
        .block_on(test);
}

#[test]
fn a_removal_given_up_on_while_queued_never_deletes_the_file_when_the_thread_frees_up() {
    on_a_single_blocking_thread(async {
        let tree = Tree::new("delete-late", true);
        let (library, _home) = library_reading(&tree, "delete-late-home").await;
        let book = only_book(&library).await;
        let crowd = tree.crowding_out_the_next_call_after_a_stat();
        let disposal = FakeDisposal::default();
        let targets = [RemovalTarget::Book { id: book }];
        let removal = library.remove_from_library(&targets, FileFate::Dispose(&disposal));
        let giving_up = async {
            crowd.entered.notified().await;
            loop {
                advance(PAST_ANY_LIMIT).await;
            }
        };

        let report = select! {
            report = removal => report.unwrap(),
            () = giving_up => unreachable!("the wait for the removal never ends by itself"),
        };
        drop(crowd);
        spawn_blocking(|| ()).await.unwrap();

        assert_eq!(
            by_name(report.files),
            [("v01.cbz".to_owned(), failed(RemovalFailure::Other))]
        );
        assert!(tree.book().is_file());
    });
}

#[tokio::test(start_paused = true)]
async fn a_stat_slower_than_a_listing_is_still_waited_for_and_the_file_goes() {
    let tree = Tree::new("delete-slow-stat", true);
    let (library, _home) = library_reading(&tree, "delete-slow-stat-home").await;
    let book = only_book(&library).await;
    let stalled = tree.stalling_on(Call::Details);
    let disposal = FakeDisposal::default();
    let targets = [RemovalTarget::Book { id: book }];
    let removal = library.remove_from_library(&targets, FileFate::Dispose(&disposal));
    let answering_late = async {
        stalled.entered.notified().await;
        advance(SLOWER_THAN_A_LISTING).await;
        drop(stalled);
    };

    let (report, ()) = tokio::join!(removal, answering_late);

    assert_eq!(
        by_name(report.unwrap().files),
        [("v01.cbz".to_owned(), FileOutcome::Deleted)]
    );
    assert!(!tree.book().exists());
}

#[tokio::test(start_paused = true)]
async fn a_root_whose_stat_never_answers_costs_one_timeout_and_fails_every_file() {
    let tree = Tree::with_books("delete-stuck-root", true, 3);
    let (library, _home) = library_reading(&tree, "delete-stuck-root-home").await;
    let series = library
        .series(LibraryListing::default(), None)
        .await
        .unwrap()
        .series
        .remove(0)
        .id;
    let scan_stats = tree.stat_calls();
    let _hung = tree.stats_never_answering();
    let disposal = FakeDisposal::default();
    let targets = [RemovalTarget::Series { id: series }];
    let removal = library.remove_from_library(&targets, FileFate::Dispose(&disposal));
    let giving_up = async {
        tree.entered_stat.notified().await;
        loop {
            advance(PAST_ANY_LIMIT).await;
        }
    };

    let report = select! {
        report = removal => report.unwrap(),
        () = giving_up => unreachable!("the wait for the removal never ends by itself"),
    };

    assert_eq!(
        by_name(report.files),
        ["v01.cbz", "v02.cbz", "v03.cbz"]
            .map(|name| (name.to_owned(), failed(RemovalFailure::UnsupportedLocation)))
    );
    assert_eq!(tree.stat_calls() - scan_stats, 1);
    assert_eq!(disposal.calls(), Vec::<PathBuf>::new());
}
