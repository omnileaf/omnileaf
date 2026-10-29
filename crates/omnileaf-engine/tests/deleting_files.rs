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
    io,
    path::{Path, PathBuf},
    pin::pin,
    sync::Arc,
    time::{Duration, SystemTime},
};

use books::{write_book, write_page};
use disposal::{DiskDisposal, FakeDisposal, Pause};
use omnileaf_engine::{
    AndroidTree, BookId, Disposal, DisposalFailure, FileDisposal, FileFate, FileOutcome,
    FileRemoval, Library, LibraryListing, OpenTree, RemovalFailure, RemovalReport, RemovalTarget,
    RootLocator, SeriesBookListing, SeriesId, TreeUri,
};
use omnileaf_formats::{Details, Entry, LocalStorage, Storage};
use scanned::{Scanned, owned};
use support::{FixedClock, ScratchFolder};
use tokio::time::timeout;

const SERIES_01: &str = "Sample Series 01";
const SERIES_02: &str = "Sample Series 02";
const LONG_ENOUGH_TO_REMOVE: Duration = Duration::from_millis(300);
const COMICS_TREE: &str = "content://documents.test/tree/primary%3ADocuments%2FComics";
const TREE_NAME: &str = "Comics";
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
    let disposal = FakeDisposal::default().replying("v01.cbz", Err(DisposalFailure::NotFound));

    let report = deleting
        .delete(&[RemovalTarget::Book { id: book }], &disposal)
        .await;

    assert_eq!(
        by_name(report.files),
        [("v01.cbz".to_owned(), FileOutcome::Missing)]
    );
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
            [stored.as_os_str().as_encoded_bytes()],
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

async fn waits_while_files_are_disposed(
    deleting: &Deleting,
    operation: impl Future<Output = ()>,
) -> bool {
    let targets = [RemovalTarget::Series {
        id: deleting.series(SERIES_01).await,
    }];
    let pause = Pause::default();
    let disposal = FakeDisposal::default().pausing_on_the_first_file(&pause);
    let removal = deleting.delete(&targets, &disposal);
    let mut operation = pin!(operation);
    let waiting = async {
        pause.entered.notified().await;
        let waited = timeout(LONG_ENOUGH_TO_REMOVE, operation.as_mut())
            .await
            .is_err();
        pause.release.notify_one();
        operation.await;
        waited
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

    assert!(waited);
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

    assert!(waited);
}

#[cfg(unix)]
#[tokio::test]
async fn a_linked_folder_that_cannot_be_written_reports_permission_denied() {
    use std::os::unix::fs::PermissionsExt;
    let deleting = Deleting::new("delete-read-only").await;
    let series = deleting.series(SERIES_02).await;
    let folder = deleting.path(SERIES_02);
    fs::set_permissions(&folder, fs::Permissions::from_mode(0o555)).unwrap();
    let writable_anyway = fs::write(folder.join("probe"), b"").is_ok();
    if writable_anyway {
        fs::set_permissions(&folder, fs::Permissions::from_mode(0o755)).unwrap();
        skipped_as_privileged("a_linked_folder_that_cannot_be_written_reports_permission_denied");
        return;
    }

    let report = deleting
        .delete(&[RemovalTarget::Series { id: series }], &DiskDisposal)
        .await;

    fs::set_permissions(&folder, fs::Permissions::from_mode(0o755)).unwrap();
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
#[expect(
    clippy::print_stderr,
    reason = "a test run as a privileged user cannot make a folder unwritable, and says it did not run"
)]
fn skipped_as_privileged(test: &str) {
    eprintln!("skipped {test}: the user can write to a folder made read-only");
}

struct Tree {
    scratch: ScratchFolder,
    removes: bool,
}

impl Tree {
    fn new(name: &str, removes: bool) -> Arc<Self> {
        let scratch = ScratchFolder::new(name);
        write_book(
            &scratch
                .path()
                .join(TREE_NAME)
                .join(SERIES_02)
                .join("v01.cbz"),
            3,
        );
        Arc::new(Self { scratch, removes })
    }

    fn on_device(&self, path: &Path) -> io::Result<PathBuf> {
        let inside = path
            .strip_prefix(TREE_NAME)
            .map_err(|_| io::Error::from(io::ErrorKind::NotFound))?;
        Ok(self.scratch.path().join(TREE_NAME).join(inside))
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
        LocalStorage.entries(&self.on_device(folder)?)
    }

    fn details(&self, path: &Path) -> io::Result<Details> {
        LocalStorage.details(&self.on_device(path)?)
    }

    fn open(&self, file: &Path) -> io::Result<File> {
        LocalStorage.open(&self.on_device(file)?)
    }

    fn remove(&self, file: &Path) -> io::Result<()> {
        if !self.removes {
            return Err(io::ErrorKind::Unsupported.into());
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
