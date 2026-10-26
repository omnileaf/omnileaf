#![expect(
    clippy::unwrap_used,
    reason = "each test writes its own folders in scratch space, so a failed set-up should stop the test"
)]

mod support;

use std::{fs, path::Path};

use omnileaf_db::{
    Config, Database,
    catalog::{BookListing, PageRequest, PageSize, SeriesListing, SeriesOrder, SeriesSort},
    rusqlite::{Connection, OpenFlags},
    store::{Store, reading_state},
};
use omnileaf_engine::{FolderKind, HomeFolderError, HomeFolderSetting, Library};
use omnileaf_sync_proto::BookId;
use omnileaf_testkit::write_sample_library;
use support::{FixedClock, ScratchFolder};

const DATABASE_FILE: &str = "library.sqlite";
const UNFINISHED_COPY: &str = "library.sqlite.partial";
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
async fn leaves_the_old_library_as_it_was() {
    let data = ScratchFolder::new("move-untouched-data");
    let other = ScratchFolder::new("move-untouched-other");
    library_read_in(data.path()).await;
    let before = database_of(data.path());
    let setting = HomeFolderSetting::in_folder(data.path().to_path_buf());
    setting.move_to(other.path()).await.unwrap();

    close(open(&setting.home().await.unwrap()).await).await;

    assert_eq!(database_of(data.path()), before);
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
