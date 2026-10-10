#![expect(
    clippy::unwrap_used,
    reason = "each test opens its own library in scratch folders, so a failed set-up should stop the test"
)]

#[expect(dead_code, reason = "these tests write whole books, never loose pages")]
mod books;
mod support;

use std::{fs, path::Path};

use books::write_book;
use omnileaf_db::{
    Config, Database,
    catalog::{PageRequest, PageSize, SeriesOrder, series_books, series_page},
    rusqlite::{Connection, OpenFlags},
    store::{Store, reading_state},
};
use omnileaf_engine::{FolderKind, Library, LibraryFolders};
use omnileaf_sync_proto::BookId;
use support::{FixedClock, ScratchFolder};

const DATABASE_FILE: &str = "library.sqlite";
const SERIES_01: &str = "Sample Series 01";
const SERIES_02: &str = "Sample Series 02";
const PAGE_READ_TO: u32 = 5;

async fn open_together(folder: &Path) -> Library {
    Library::open(folder.to_path_buf(), FixedClock)
        .await
        .unwrap()
}

async fn open_apart(database: &Path, home: &Path) -> Library {
    let folders = LibraryFolders {
        database: database.to_path_buf(),
        home: home.to_path_buf(),
    };
    Library::open(folders, FixedClock).await.unwrap()
}

async fn series_titles(library: &Library) -> Vec<(String, u32)> {
    library
        .series(None)
        .await
        .unwrap()
        .series
        .into_iter()
        .map(|series| (series.title, series.book_count))
        .collect()
}

async fn folders(library: &Library) -> Vec<(FolderKind, String)> {
    library
        .folders(None)
        .await
        .unwrap()
        .folders
        .into_iter()
        .map(|folder| (folder.kind, folder.name))
        .collect()
}

fn read_only(database: &Path) -> Connection {
    Connection::open_with_flags(
        database.join(DATABASE_FILE),
        OpenFlags::SQLITE_OPEN_READ_ONLY,
    )
    .unwrap()
}

fn only_book(database: &Path) -> BookId {
    let whole_page = PageRequest {
        after: None,
        size: PageSize::try_from(PageSize::MAX).unwrap(),
    };
    let connection = read_only(database);
    let series = series_page(&connection, SeriesOrder::Title, &whole_page)
        .unwrap()
        .items;
    assert_eq!(series.len(), 1);
    let books = series_books(&connection, series.first().unwrap().id, &whole_page)
        .unwrap()
        .items;
    assert_eq!(books.len(), 1);
    books.first().unwrap().id
}

/// Writes through a store of its own on the library's database, as reading a book would.
async fn read_to_page(database: &Path, book: BookId) {
    let config = Config {
        path: database.join(DATABASE_FILE),
        backup_dir: database.join("backups"),
        mmap_size_bytes: 0,
    };
    Store::new(Database::open(&config).unwrap(), FixedClock)
        .write(move |writer| writer.set_position(book, PAGE_READ_TO))
        .await
        .unwrap();
}

fn position_of(database: &Path, book: BookId) -> Option<u32> {
    reading_state(&read_only(database), book)
        .unwrap()
        .and_then(|state| state.position_page)
}

/// Opens a library whose one book is in its home, read to a page, returning that book.
async fn library_read_in(database: &Path, home: &Path) -> BookId {
    write_book(&home.join(SERIES_01).join("v01.cbz"), 1);
    let library = open_apart(database, home).await;
    library.rescan_folders().await.unwrap();
    drop(library);
    let book = only_book(database);
    read_to_page(database, book).await;
    book
}

#[tokio::test]
async fn keeps_the_database_out_of_a_home_folder_kept_apart_and_reads_the_books_there() {
    let database = ScratchFolder::new("home-apart-database");
    let home = ScratchFolder::new("home-apart-home");
    write_book(&home.path().join(SERIES_01).join("v01.cbz"), 1);
    let library = open_apart(database.path(), home.path()).await;

    library.rescan_folders().await.unwrap();

    assert_eq!(series_titles(&library).await, [(SERIES_01.to_owned(), 1)]);
    assert!(database.path().join(DATABASE_FILE).exists());
    assert!(!home.path().join(DATABASE_FILE).exists());
}

#[tokio::test]
async fn keeps_the_books_and_reading_state_of_a_home_moved_with_its_files() {
    let database = ScratchFolder::new("home-moved-database");
    let container = ScratchFolder::new("home-moved-container");
    let before = container.path().join("Before");
    let after = container.path().join("After");
    let book = library_read_in(database.path(), &before).await;
    fs::rename(&before, &after).unwrap();
    let library = open_apart(database.path(), &after).await;

    library.rescan_folders().await.unwrap();

    assert_eq!(
        folders(&library).await,
        [(FolderKind::Home, "After".to_owned())]
    );
    assert_eq!(only_book(database.path()), book);
    assert_eq!(position_of(database.path(), book), Some(PAGE_READ_TO));
}

#[tokio::test]
async fn keeps_the_books_and_reading_state_of_a_home_left_behind_as_a_linked_folder() {
    let data = ScratchFolder::new("home-left-data");
    let documents = ScratchFolder::new("home-left-documents");
    let book = library_read_in(data.path(), data.path()).await;
    write_book(&documents.path().join(SERIES_02).join("v01.cbz"), 2);
    let library = open_apart(data.path(), documents.path()).await;

    library.rescan_folders().await.unwrap();

    assert_eq!(
        folders(&library).await,
        [
            (FolderKind::Linked, "home-left-data".to_owned()),
            (FolderKind::Home, "home-left-documents".to_owned()),
        ]
    );
    assert_eq!(
        series_titles(&library).await,
        [(SERIES_01.to_owned(), 1), (SERIES_02.to_owned(), 1)]
    );
    assert_eq!(position_of(data.path(), book), Some(PAGE_READ_TO));
}

#[tokio::test]
async fn moves_a_home_that_held_no_books_without_keeping_the_old_folder() {
    let data = ScratchFolder::new("home-empty-data");
    let documents = ScratchFolder::new("home-empty-documents");
    drop(open_together(data.path()).await);
    write_book(&documents.path().join(SERIES_01).join("v01.cbz"), 1);
    let library = open_apart(data.path(), documents.path()).await;

    library.rescan_folders().await.unwrap();

    assert_eq!(
        folders(&library).await,
        [(FolderKind::Home, "home-empty-documents".to_owned())]
    );
    assert_eq!(series_titles(&library).await, [(SERIES_01.to_owned(), 1)]);
}
