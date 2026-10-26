#![expect(
    clippy::unwrap_used,
    reason = "each test writes its own folders in scratch space, so a failed set-up should stop the test"
)]

mod support;

use std::{
    fs,
    path::Path,
    time::{Duration, SystemTime},
};

use omnileaf_db::{
    Config, Database,
    catalog::{BookListing, PageRequest, PageSize, SeriesListing, SeriesOrder, SeriesSort},
    rusqlite::{Connection, OpenFlags},
    store::{Store, reading_state},
};
use omnileaf_engine::{
    FolderKind, HomeChoice, HomeFolderError, HomeFolderSetting, Library, found_library_in,
};
use omnileaf_sync_proto::BookId;
use omnileaf_testkit::write_sample_library;
use support::{FixedClock, ScratchFolder};

const DATABASE_FILE: &str = "library.sqlite";
const UNFINISHED_COPY: &str = "library.sqlite.partial";
const WRITE_AHEAD_LOG: &str = "library.sqlite-wal";
const WRITE_AHEAD_LOG_INDEX: &str = "library.sqlite-shm";
const SET_ASIDE_DATABASE: &str = "library-moved.sqlite";
const SET_ASIDE_WRITE_AHEAD_LOG: &str = "library-moved.sqlite-wal";
const SET_ASIDE_WRITE_AHEAD_LOG_INDEX: &str = "library-moved.sqlite-shm";
const SECOND_SET_ASIDE_DATABASE: &str = "library-moved-2.sqlite";
const SIDECAR_SET_ASIDES: [(&str, &str); 2] = [
    (WRITE_AHEAD_LOG, SET_ASIDE_WRITE_AHEAD_LOG),
    (WRITE_AHEAD_LOG_INDEX, SET_ASIDE_WRITE_AHEAD_LOG_INDEX),
];
const DATABASE_SET_ASIDE: (&str, &str) = (DATABASE_FILE, SET_ASIDE_DATABASE);
const SET_ASIDE_ONCE: [&str; 5] = [
    SET_ASIDE_DATABASE,
    SET_ASIDE_WRITE_AHEAD_LOG,
    SET_ASIDE_WRITE_AHEAD_LOG_INDEX,
    SECOND_SET_ASIDE_DATABASE,
    DATABASE_FILE,
];
const BACKUP_FOLDER: &str = "backups";
const OLDER_BACKUP: &str = "schema-v1.sqlite";
const NEWER_BACKUP: &str = "schema-v2.sqlite";
const UNFINISHED_BACKUP: &str = "schema-v3.sqlite.partial";
const OLDER_BACKUP_AT_MS: u64 = 1_780_000_000_000;
const NEWER_BACKUP_AT_MS: u64 = 1_785_000_000_000;
const UNFINISHED_BACKUP_AT_MS: u64 = 1_789_000_000_000;
const PAGE_READ_TO: u32 = 5;

async fn open(home: &Path) -> Library {
    Library::open(home.to_path_buf(), FixedClock).await.unwrap()
}

/// Windows refuses to move or replace a file a dropped library still holds open until its save task next runs.
async fn close(library: Library) {
    drop(library);
    tokio::task::yield_now().await;
}

async fn library_read_in(home: &Path) {
    write_sample_library(home).unwrap();
    let library = open(home).await;
    library.rescan_folders().await.unwrap();
    close(library).await;
}

fn read_only(home: &Path) -> Connection {
    Connection::open_with_flags(home.join(DATABASE_FILE), OpenFlags::SQLITE_OPEN_READ_ONLY).unwrap()
}

fn first_book(home: &Path) -> BookId {
    let first = PageRequest {
        after: None,
        size: PageSize::try_from(1).unwrap(),
    };
    let connection = read_only(home);
    let series = omnileaf_db::catalog::series_page(
        &connection,
        &SeriesListing::unfiltered(SeriesSort::ascending(SeriesOrder::Title)),
        &first,
    )
    .unwrap()
    .items;
    let books = omnileaf_db::catalog::series_books(
        &connection,
        series.first().unwrap().id,
        BookListing::IN_ORDER,
        &first,
    )
    .unwrap()
    .items;
    books.first().unwrap().id
}

async fn read_first_book_in(home: &Path) -> BookId {
    let book = first_book(home);
    let config = Config {
        path: home.join(DATABASE_FILE),
        backup_dir: home.join("backups"),
        mmap_size_bytes: 0,
    };
    Store::new(Database::open(&config).unwrap(), FixedClock)
        .write(move |writer| writer.set_position(book, PAGE_READ_TO))
        .await
        .unwrap();
    tokio::task::yield_now().await;
    book
}

fn position_of(home: &Path, book: BookId) -> Option<u32> {
    reading_state(&read_only(home), book)
        .unwrap()
        .and_then(|state| state.position_page)
}

fn database_of(home: &Path) -> Vec<u8> {
    fs::read(home.join(DATABASE_FILE)).unwrap()
}

fn copy_by_hand(from: &Path, to: &Path) {
    let target = to.join(DATABASE_FILE);
    Connection::open(from.join(DATABASE_FILE))
        .unwrap()
        .execute("VACUUM INTO ?1", [target.to_str().unwrap()])
        .unwrap();
}

fn name_of(folder: &Path) -> String {
    folder.file_name().unwrap().to_str().unwrap().to_owned()
}

fn file_in(folder: &Path, name: &str) -> Option<Vec<u8>> {
    fs::read(folder.join(name)).ok()
}

/// SQLite reads a write-ahead-log database in a folder it cannot write only once the database's shared-memory index is there.
#[cfg(unix)]
fn leave_sqlite_index_beside(home: &Path) {
    read_only(home)
        .query_row("SELECT count(*) FROM sqlite_schema", [], |row| {
            row.get::<_, i64>(0)
        })
        .unwrap();
}

#[cfg(unix)]
fn lock(folder: &Path) {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(folder, fs::Permissions::from_mode(0o555)).unwrap();
}

#[cfg(unix)]
fn unlock(folder: &Path) {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(folder, fs::Permissions::from_mode(0o755)).unwrap();
}

#[cfg(unix)]
fn forbid_listing(folder: &Path) {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(folder, fs::Permissions::from_mode(0o333)).unwrap();
}

#[cfg(unix)]
async fn move_cut_short_out_of_a_locked_home(
    data: &Path,
    old: &Path,
    to: &Path,
) -> HomeFolderSetting {
    let setting = HomeFolderSetting::in_folder(data.to_path_buf());
    library_read_in(old).await;
    setting.use_library_in(old).await.unwrap();
    setting.move_to(to).await.unwrap();
    copy_by_hand(old, to);
    leave_sqlite_index_beside(old);
    lock(old);
    setting
}

fn rename_by_hand(folder: &Path, renames: &[(&str, &str)]) {
    for (name, new_name) in renames {
        fs::rename(folder.join(name), folder.join(new_name)).unwrap();
    }
}

fn which_exist<const N: usize>(folder: &Path, names: [&str; N]) -> [bool; N] {
    names.map(|name| folder.join(name).exists())
}

fn write_backup(home: &Path, name: &str, made_at_ms: u64) {
    let backups = home.join(BACKUP_FOLDER);
    fs::create_dir_all(&backups).unwrap();
    let backup = backups.join(name);
    fs::write(&backup, name).unwrap();
    fs::File::options()
        .write(true)
        .open(&backup)
        .unwrap()
        .set_modified(SystemTime::UNIX_EPOCH + Duration::from_millis(made_at_ms))
        .unwrap();
}

fn make_read_only(path: &Path) {
    let mut permissions = fs::metadata(path).unwrap().permissions();
    permissions.set_readonly(true);
    fs::set_permissions(path, permissions).unwrap();
}

fn write_backups(home: &Path) {
    write_backup(home, OLDER_BACKUP, OLDER_BACKUP_AT_MS);
    write_backup(home, NEWER_BACKUP, NEWER_BACKUP_AT_MS);
    write_backup(home, UNFINISHED_BACKUP, UNFINISHED_BACKUP_AT_MS);
}

fn backups_in(home: &Path) -> Vec<(String, Vec<u8>)> {
    let Ok(entries) = fs::read_dir(home.join(BACKUP_FOLDER)) else {
        return Vec::new();
    };
    let mut backups: Vec<_> = entries
        .map(|entry| {
            let entry = entry.unwrap();
            (
                entry.file_name().into_string().unwrap(),
                fs::read(entry.path()).unwrap(),
            )
        })
        .collect();
    backups.sort();
    backups
}

fn backup(name: &str) -> (String, Vec<u8>) {
    (name.to_owned(), name.as_bytes().to_vec())
}

#[tokio::test]
async fn moves_the_library_and_its_progress_into_an_empty_folder() {
    let data = ScratchFolder::new("move-progress-data");
    let other = ScratchFolder::new("move-progress-other");
    library_read_in(data.path()).await;
    let book = read_first_book_in(data.path()).await;
    let setting = HomeFolderSetting::in_folder(data.path().to_path_buf());
    setting.move_to(other.path()).await.unwrap();

    let home = setting.home().await.unwrap();

    assert_eq!(home, other.path());
    assert_eq!(position_of(other.path(), book), Some(PAGE_READ_TO));
}

#[tokio::test]
async fn keeps_reading_the_books_left_in_the_old_home() {
    let data = ScratchFolder::new("move-linked-data");
    let other = ScratchFolder::new("move-linked-other");
    library_read_in(data.path()).await;
    let setting = HomeFolderSetting::in_folder(data.path().to_path_buf());
    setting.move_to(other.path()).await.unwrap();

    let library = open(&setting.home().await.unwrap()).await;

    let folders = library.folders(None).await.unwrap().folders;
    assert_eq!(
        folders
            .into_iter()
            .map(|folder| (folder.kind, folder.name))
            .collect::<Vec<_>>(),
        [
            (FolderKind::Linked, name_of(data.path())),
            (FolderKind::Home, name_of(other.path())),
        ]
    );
}

#[tokio::test]
async fn keeps_the_old_library_set_aside_as_it_was() {
    let data = ScratchFolder::new("move-untouched-data");
    let other = ScratchFolder::new("move-untouched-other");
    library_read_in(data.path()).await;
    let before = database_of(data.path());
    let setting = HomeFolderSetting::in_folder(data.path().to_path_buf());
    setting.move_to(other.path()).await.unwrap();

    close(open(&setting.home().await.unwrap()).await).await;

    assert_eq!(file_in(data.path(), SET_ASIDE_DATABASE), Some(before));
}

#[tokio::test]
async fn offers_no_library_in_the_old_home_once_moved() {
    let data = ScratchFolder::new("move-offer-data");
    let other = ScratchFolder::new("move-offer-other");
    library_read_in(data.path()).await;
    let setting = HomeFolderSetting::in_folder(data.path().to_path_buf());
    setting.move_to(other.path()).await.unwrap();
    setting.home().await.unwrap();

    let choice = setting.choose(data.path()).await.unwrap();

    assert_eq!(choice, HomeChoice::Empty);
}

#[tokio::test]
async fn sets_the_old_library_aside_beside_one_set_aside_before() {
    let data = ScratchFolder::new("move-aside-twice-data");
    let other = ScratchFolder::new("move-aside-twice-other");
    library_read_in(data.path()).await;
    let before = database_of(data.path());
    fs::write(data.path().join(SET_ASIDE_DATABASE), "set aside before").unwrap();
    let setting = HomeFolderSetting::in_folder(data.path().to_path_buf());
    setting.move_to(other.path()).await.unwrap();

    setting.home().await.unwrap();

    assert_eq!(
        (
            file_in(data.path(), SET_ASIDE_DATABASE),
            file_in(data.path(), SECOND_SET_ASIDE_DATABASE)
        ),
        (Some(b"set aside before".to_vec()), Some(before))
    );
}

#[tokio::test]
async fn leaves_no_write_ahead_log_where_the_old_library_was() {
    let data = ScratchFolder::new("move-sidecars-data");
    let other = ScratchFolder::new("move-sidecars-other");
    library_read_in(data.path()).await;
    let setting = HomeFolderSetting::in_folder(data.path().to_path_buf());
    setting.move_to(other.path()).await.unwrap();
    copy_by_hand(data.path(), other.path());

    setting.home().await.unwrap();

    assert_eq!(
        [WRITE_AHEAD_LOG, WRITE_AHEAD_LOG_INDEX].map(|sidecar| data.path().join(sidecar).exists()),
        [false, false]
    );
}

#[cfg(unix)]
#[tokio::test]
async fn keeps_the_move_when_the_old_library_cannot_be_set_aside() {
    let data = ScratchFolder::new("move-locked-data");
    let old = ScratchFolder::new("move-locked-old");
    let other = ScratchFolder::new("move-locked-other");
    let setting = move_cut_short_out_of_a_locked_home(data.path(), old.path(), other.path()).await;

    let home = setting.home().await.unwrap();

    unlock(old.path());
    assert_eq!(home, other.path());
    assert!(old.path().join(DATABASE_FILE).exists());
}

#[cfg(unix)]
#[tokio::test]
async fn sets_the_old_library_aside_on_the_next_launch_when_it_could_not_at_first() {
    let data = ScratchFolder::new("move-unlocked-data");
    let old = ScratchFolder::new("move-unlocked-old");
    let other = ScratchFolder::new("move-unlocked-other");
    let setting = move_cut_short_out_of_a_locked_home(data.path(), old.path(), other.path()).await;
    setting.home().await.unwrap();
    unlock(old.path());

    let home = setting.home().await.unwrap();

    assert_eq!(home, other.path());
    assert!(!old.path().join(DATABASE_FILE).exists());
}

#[cfg(unix)]
#[tokio::test]
async fn pairs_the_old_library_with_its_log_after_a_set_aside_cut_short_between_renames() {
    let data = ScratchFolder::new("move-aside-sidecars-cut-data");
    let old = ScratchFolder::new("move-aside-sidecars-cut-old");
    let other = ScratchFolder::new("move-aside-sidecars-cut-other");
    let setting = move_cut_short_out_of_a_locked_home(data.path(), old.path(), other.path()).await;
    setting.home().await.unwrap();
    unlock(old.path());
    rename_by_hand(old.path(), &SIDECAR_SET_ASIDES);

    setting.home().await.unwrap();

    assert_eq!(
        which_exist(old.path(), SET_ASIDE_ONCE),
        [true, true, true, false, false]
    );
}

#[cfg(unix)]
#[tokio::test]
async fn finishes_a_set_aside_cut_short_after_its_renames() {
    let data = ScratchFolder::new("move-aside-renamed-data");
    let old = ScratchFolder::new("move-aside-renamed-old");
    let other = ScratchFolder::new("move-aside-renamed-other");
    let setting = move_cut_short_out_of_a_locked_home(data.path(), old.path(), other.path()).await;
    setting.home().await.unwrap();
    unlock(old.path());
    rename_by_hand(old.path(), &SIDECAR_SET_ASIDES);
    rename_by_hand(old.path(), &[DATABASE_SET_ASIDE]);

    let home = setting.home().await.unwrap();

    assert_eq!(home, other.path());
    assert_eq!(
        which_exist(old.path(), SET_ASIDE_ONCE),
        [true, true, true, false, false]
    );
}

#[cfg(unix)]
#[tokio::test]
async fn keeps_the_move_when_the_old_home_cannot_be_synced() {
    let data = ScratchFolder::new("move-old-unsynced-data");
    let old = ScratchFolder::new("move-old-unsynced-old");
    let other = ScratchFolder::new("move-old-unsynced-other");
    let setting = HomeFolderSetting::in_folder(data.path().to_path_buf());
    library_read_in(old.path()).await;
    setting.use_library_in(old.path()).await.unwrap();
    setting.move_to(other.path()).await.unwrap();
    forbid_listing(old.path());

    let home = setting.home().await.unwrap();

    unlock(old.path());
    assert_eq!(home, other.path());
    assert!(old.path().join(SET_ASIDE_DATABASE).exists());
}

#[cfg(unix)]
#[tokio::test]
async fn stays_in_the_old_home_when_the_new_home_cannot_be_synced() {
    let data = ScratchFolder::new("move-unsynced-data");
    let other = ScratchFolder::new("move-unsynced-other");
    library_read_in(data.path()).await;
    let setting = HomeFolderSetting::in_folder(data.path().to_path_buf());
    setting.move_to(other.path()).await.unwrap();
    forbid_listing(other.path());

    let home = setting.home().await.unwrap();

    unlock(other.path());
    assert_eq!(home, data.path());
    assert!(data.path().join(DATABASE_FILE).exists());
}

#[tokio::test]
async fn refuses_to_move_into_a_folder_that_holds_a_library() {
    let data = ScratchFolder::new("move-taken-data");
    let other = ScratchFolder::new("move-taken-other");
    library_read_in(data.path()).await;
    library_read_in(other.path()).await;
    let setting = HomeFolderSetting::in_folder(data.path().to_path_buf());

    let moved = setting.move_to(other.path()).await;

    assert!(matches!(moved, Err(HomeFolderError::LibraryThere { .. })));
    assert_eq!(setting.home().await.unwrap(), data.path());
}

#[tokio::test]
async fn refuses_to_move_into_a_folder_inside_the_home() {
    let data = ScratchFolder::new("move-inside-data");
    library_read_in(data.path()).await;
    let setting = HomeFolderSetting::in_folder(data.path().to_path_buf());

    let moved = setting.move_to(&data.path().join("Inside")).await;

    assert!(matches!(moved, Err(HomeFolderError::OverlapsHome { .. })));
    assert_eq!(setting.home().await.unwrap(), data.path());
}

#[tokio::test]
async fn finishes_a_move_cut_short_once_the_copy_was_in_place() {
    let data = ScratchFolder::new("move-placed-data");
    let other = ScratchFolder::new("move-placed-other");
    library_read_in(data.path()).await;
    let book = read_first_book_in(data.path()).await;
    let setting = HomeFolderSetting::in_folder(data.path().to_path_buf());
    setting.move_to(other.path()).await.unwrap();
    copy_by_hand(data.path(), other.path());

    let home = setting.home().await.unwrap();

    assert_eq!(home, other.path());
    assert_eq!(position_of(other.path(), book), Some(PAGE_READ_TO));
    assert!(!other.path().join(UNFINISHED_COPY).exists());
}

#[tokio::test]
async fn copies_again_after_a_move_cut_short_while_copying() {
    let data = ScratchFolder::new("move-partial-data");
    let other = ScratchFolder::new("move-partial-other");
    library_read_in(data.path()).await;
    let book = read_first_book_in(data.path()).await;
    let setting = HomeFolderSetting::in_folder(data.path().to_path_buf());
    setting.move_to(other.path()).await.unwrap();
    fs::write(other.path().join(UNFINISHED_COPY), b"half a library").unwrap();

    let home = setting.home().await.unwrap();

    assert_eq!(home, other.path());
    assert_eq!(position_of(other.path(), book), Some(PAGE_READ_TO));
}

#[tokio::test]
async fn stays_in_the_old_home_when_another_library_reached_the_new_one_first() {
    let data = ScratchFolder::new("move-raced-data");
    let other = ScratchFolder::new("move-raced-other");
    library_read_in(data.path()).await;
    let setting = HomeFolderSetting::in_folder(data.path().to_path_buf());
    setting.move_to(other.path()).await.unwrap();
    library_read_in(other.path()).await;
    let theirs = database_of(other.path());

    let home = setting.home().await.unwrap();

    assert_eq!(home, data.path());
    assert_eq!(database_of(other.path()), theirs);
}

#[tokio::test]
async fn copies_the_finished_backups_into_the_new_home() {
    let data = ScratchFolder::new("move-backups-data");
    let other = ScratchFolder::new("move-backups-other");
    library_read_in(data.path()).await;
    write_backups(data.path());
    let setting = HomeFolderSetting::in_folder(data.path().to_path_buf());
    setting.move_to(other.path()).await.unwrap();

    setting.home().await.unwrap();

    assert_eq!(
        backups_in(other.path()),
        [backup(OLDER_BACKUP), backup(NEWER_BACKUP)]
    );
}

#[tokio::test]
async fn copies_a_read_only_backup_into_the_new_home() {
    let data = ScratchFolder::new("move-backups-read-only-data");
    let other = ScratchFolder::new("move-backups-read-only-other");
    library_read_in(data.path()).await;
    write_backups(data.path());
    make_read_only(&data.path().join(BACKUP_FOLDER).join(OLDER_BACKUP));
    let setting = HomeFolderSetting::in_folder(data.path().to_path_buf());
    setting.move_to(other.path()).await.unwrap();

    setting.home().await.unwrap();

    assert_eq!(
        backups_in(other.path()),
        [backup(OLDER_BACKUP), backup(NEWER_BACKUP)]
    );
}

#[tokio::test]
async fn dates_the_moved_library_by_the_backups_it_brought() {
    let data = ScratchFolder::new("move-backup-dates-data");
    let other = ScratchFolder::new("move-backup-dates-other");
    library_read_in(data.path()).await;
    write_backups(data.path());
    let setting = HomeFolderSetting::in_folder(data.path().to_path_buf());
    setting.move_to(other.path()).await.unwrap();

    setting.home().await.unwrap();

    assert_eq!(
        found_library_in(other.path())
            .await
            .unwrap()
            .unwrap()
            .last_backup_at_ms,
        Some(i64::try_from(NEWER_BACKUP_AT_MS).unwrap())
    );
}

#[tokio::test]
async fn leaves_the_backups_in_the_old_home() {
    let data = ScratchFolder::new("move-backups-kept-data");
    let other = ScratchFolder::new("move-backups-kept-other");
    library_read_in(data.path()).await;
    write_backups(data.path());
    let setting = HomeFolderSetting::in_folder(data.path().to_path_buf());
    setting.move_to(other.path()).await.unwrap();

    setting.home().await.unwrap();

    assert_eq!(
        backups_in(data.path()),
        [
            backup(OLDER_BACKUP),
            backup(NEWER_BACKUP),
            backup(UNFINISHED_BACKUP)
        ]
    );
}

#[tokio::test]
async fn copies_the_backups_again_after_a_move_cut_short_while_copying_them() {
    let data = ScratchFolder::new("move-backups-partial-data");
    let other = ScratchFolder::new("move-backups-partial-other");
    library_read_in(data.path()).await;
    write_backups(data.path());
    let setting = HomeFolderSetting::in_folder(data.path().to_path_buf());
    setting.move_to(other.path()).await.unwrap();
    write_backup(
        other.path(),
        &format!("{OLDER_BACKUP}.partial"),
        OLDER_BACKUP_AT_MS,
    );

    setting.home().await.unwrap();

    assert_eq!(
        backups_in(other.path()),
        [backup(OLDER_BACKUP), backup(NEWER_BACKUP)]
    );
}

#[tokio::test]
async fn finishes_a_move_cut_short_after_copying_a_backup() {
    let data = ScratchFolder::new("move-backup-copied-data");
    let other = ScratchFolder::new("move-backup-copied-other");
    library_read_in(data.path()).await;
    write_backups(data.path());
    let setting = HomeFolderSetting::in_folder(data.path().to_path_buf());
    setting.move_to(other.path()).await.unwrap();
    write_backup(other.path(), OLDER_BACKUP, OLDER_BACKUP_AT_MS);

    let home = setting.home().await.unwrap();

    assert_eq!(home, other.path());
    assert_eq!(
        backups_in(other.path()),
        [backup(OLDER_BACKUP), backup(NEWER_BACKUP)]
    );
}

#[tokio::test]
async fn stays_in_the_old_home_when_the_new_home_holds_another_backup_by_that_name() {
    let data = ScratchFolder::new("move-backups-there-data");
    let other = ScratchFolder::new("move-backups-there-other");
    library_read_in(data.path()).await;
    write_backups(data.path());
    let setting = HomeFolderSetting::in_folder(data.path().to_path_buf());
    setting.move_to(other.path()).await.unwrap();
    fs::create_dir_all(other.path().join(BACKUP_FOLDER)).unwrap();
    fs::write(
        other.path().join(BACKUP_FOLDER).join(OLDER_BACKUP),
        "another library's backup",
    )
    .unwrap();

    let home = setting.home().await.unwrap();

    assert_eq!(home, data.path());
    assert_eq!(
        file_in(&other.path().join(BACKUP_FOLDER), OLDER_BACKUP),
        Some(b"another library's backup".to_vec())
    );
}

#[tokio::test]
async fn stays_in_the_old_home_when_the_backups_cannot_be_copied() {
    let data = ScratchFolder::new("move-backups-blocked-data");
    let other = ScratchFolder::new("move-backups-blocked-other");
    library_read_in(data.path()).await;
    write_backups(data.path());
    let setting = HomeFolderSetting::in_folder(data.path().to_path_buf());
    setting.move_to(other.path()).await.unwrap();
    fs::write(
        other.path().join(BACKUP_FOLDER),
        "a file where the backups go",
    )
    .unwrap();

    let home = setting.home().await.unwrap();

    assert_eq!(home, data.path());
    assert!(!other.path().join(DATABASE_FILE).exists());
}
