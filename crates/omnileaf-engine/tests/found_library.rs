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

use omnileaf_db::rusqlite::Connection;
use omnileaf_engine::{FoundLibrary, Library, LibraryError, found_library_in};
use omnileaf_testkit::write_sample_library;
use support::{FixedClock, ScratchFolder};

const DATABASE_FILE: &str = "library.sqlite";
const BACKUP_FOLDER: &str = "backups";
const SAMPLE_SERIES: u32 = 3;
const SAMPLE_BOOKS: u32 = 7;
const OLDER_BACKUP_AT_MS: u64 = 1_780_000_000_000;
const NEWER_BACKUP_AT_MS: u64 = 1_785_000_000_000;
const UNFINISHED_BACKUP_AT_MS: u64 = 1_789_000_000_000;
const SCHEMA_FROM_THE_FUTURE: u32 = 9_999;
const ANOTHER_APPLICATION_ID: i32 = 0x0F0F_0F0F;

async fn library_read_in(home: &Path) {
    write_sample_library(home).unwrap();
    let library = Library::open(home.to_path_buf(), FixedClock).await.unwrap();
    library.rescan_folders().await.unwrap();
    drop(library);
    tokio::task::yield_now().await;
}

fn write_backup(home: &Path, name: &str, made_at_ms: u64) {
    let backups = home.join(BACKUP_FOLDER);
    fs::create_dir_all(&backups).unwrap();
    let backup = backups.join(name);
    fs::write(&backup, b"backup").unwrap();
    fs::File::options()
        .write(true)
        .open(&backup)
        .unwrap()
        .set_modified(SystemTime::UNIX_EPOCH + Duration::from_millis(made_at_ms))
        .unwrap();
}

fn signed_ms(at_ms: u64) -> i64 {
    i64::try_from(at_ms).unwrap()
}

#[tokio::test]
async fn finds_no_library_in_a_folder_without_one() {
    let folder = ScratchFolder::new("found-none");
    write_sample_library(folder.path()).unwrap();

    let found = found_library_in(folder.path()).await;

    assert!(matches!(found, Ok(None)));
}

#[tokio::test]
async fn finds_the_series_and_books_of_a_library_already_in_a_folder() {
    let home = ScratchFolder::new("found-library");
    library_read_in(home.path()).await;

    let found = found_library_in(home.path()).await.unwrap();

    assert_eq!(
        found,
        Some(FoundLibrary {
            series: SAMPLE_SERIES,
            books: SAMPLE_BOOKS,
            last_backup_at_ms: None,
        })
    );
}

#[tokio::test]
async fn dates_the_found_library_by_its_newest_finished_backup() {
    let home = ScratchFolder::new("found-backups");
    library_read_in(home.path()).await;
    write_backup(home.path(), "schema-v1.sqlite", OLDER_BACKUP_AT_MS);
    write_backup(home.path(), "schema-v2.sqlite", NEWER_BACKUP_AT_MS);
    write_backup(
        home.path(),
        "schema-v3.sqlite.partial",
        UNFINISHED_BACKUP_AT_MS,
    );

    let found = found_library_in(home.path()).await.unwrap().unwrap();

    assert_eq!(found.last_backup_at_ms, Some(signed_ms(NEWER_BACKUP_AT_MS)));
}

#[tokio::test]
async fn leaves_the_library_it_found_as_it_was() {
    let home = ScratchFolder::new("found-untouched");
    library_read_in(home.path()).await;
    let database = home.path().join(DATABASE_FILE);
    let before = fs::read(&database).unwrap();

    found_library_in(home.path()).await.unwrap();

    assert_eq!(fs::read(&database).unwrap(), before);
}

#[tokio::test]
async fn refuses_a_library_a_newer_version_wrote() {
    let home = ScratchFolder::new("found-newer");
    library_read_in(home.path()).await;
    Connection::open(home.path().join(DATABASE_FILE))
        .unwrap()
        .pragma_update(None, "user_version", SCHEMA_FROM_THE_FUTURE)
        .unwrap();

    let found = found_library_in(home.path()).await;

    assert!(found.is_err_and(|error| error.was_written_by_a_newer_version()));
}

#[tokio::test]
async fn refuses_a_database_another_application_wrote() {
    let folder = ScratchFolder::new("found-foreign");
    let foreign = Connection::open(folder.path().join(DATABASE_FILE)).unwrap();
    foreign
        .pragma_update(None, "application_id", ANOTHER_APPLICATION_ID)
        .unwrap();
    foreign
        .execute_batch("CREATE TABLE note (body TEXT)")
        .unwrap();
    drop(foreign);

    let found = found_library_in(folder.path()).await;

    assert!(matches!(
        found,
        Err(LibraryError::Database(
            omnileaf_db::Error::NotALibrary { .. }
        ))
    ));
}
