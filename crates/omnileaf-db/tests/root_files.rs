#![expect(
    clippy::unwrap_used,
    reason = "each test builds its own scratch library, so a failed set-up should stop the test"
)]

mod support;

use std::{
    collections::BTreeSet,
    path::{Path, PathBuf},
};

use omnileaf_db::{
    Database,
    catalog::{
        BookFile, NewRoot, NewSeries, RootId, RootKind, RootLocator, ScannedBook, StoredFile,
        add_root, record_scanned_books, remove_book_files, remove_books_without_files, root_files,
    },
};
use omnileaf_sync_proto::{BookId, Fingerprint, ImageEntry};
use support::ScratchFolder;

const ADDED_AT_MS: i64 = 1_790_000_000_000;
const MODIFIED_AT_MS: i64 = 1_780_000_000_000;
const SERIES: &str = "Sample Series 01";
const COMICS: &str = "/media/Comics";
const MANGA: &str = "/media/Manga";

struct Library {
    database: Database,
    _folder: ScratchFolder,
}

impl Library {
    fn open(name: &str) -> Self {
        let folder = ScratchFolder::new(name);
        Self {
            database: Database::open(&folder.config()).unwrap(),
            _folder: folder,
        }
    }

    async fn add_root(&self, path: &str) -> RootId {
        let root = NewRoot {
            kind: RootKind::Linked,
            locator: RootLocator::Path(PathBuf::from(path)),
            added_at_ms: ADDED_AT_MS,
        };
        self.database
            .write(move |transaction| add_root(transaction, &root))
            .await
            .unwrap()
    }

    async fn record(&self, root: RootId, location: &str, page_crc: u32) -> BookId {
        let fingerprint = fingerprint(page_crc);
        let scanned = ScannedBook {
            series: NewSeries::local(SERIES, ADDED_AT_MS).unwrap(),
            fingerprint,
            title: format!("Volume {page_crc:02}"),
            added_at_ms: ADDED_AT_MS,
            file: BookFile {
                root,
                location: PathBuf::from(location),
                size_bytes: u64::from(page_crc) * 100,
                modified_at_ms: MODIFIED_AT_MS,
            },
        };
        self.database
            .write(move |transaction| record_scanned_books(transaction, &[scanned]))
            .await
            .unwrap();
        BookId::local(&fingerprint)
    }

    async fn files(&self, root: RootId) -> Vec<StoredFile> {
        let mut files = self
            .database
            .read(move |connection| root_files(connection, root))
            .await
            .unwrap();
        files.sort_by(|left, right| left.location.cmp(&right.location));
        files
    }

    async fn remove_files(&self, root: RootId, locations: &[&str]) -> Vec<BookId> {
        let locations: Vec<PathBuf> = locations.iter().map(PathBuf::from).collect();
        self.database
            .write(move |transaction| remove_book_files(transaction, root, &locations))
            .await
            .unwrap()
    }

    async fn remove_fileless(&self, books: Vec<BookId>) -> usize {
        self.database
            .write(move |transaction| remove_books_without_files(transaction, &books))
            .await
            .unwrap()
    }

    async fn book_ids(&self) -> BTreeSet<BookId> {
        self.database
            .read(|connection| {
                let mut statement = connection.prepare("SELECT id FROM book")?;
                let ids = statement
                    .query_map([], |row| row.get::<_, Vec<u8>>(0))?
                    .map(|id| Ok(BookId::try_from(id?.as_slice()).unwrap()))
                    .collect::<Result<_, omnileaf_db::Error>>()?;
                Ok(ids)
            })
            .await
            .unwrap()
    }
}

fn fingerprint(page_crc: u32) -> Fingerprint {
    Fingerprint::pmf1([ImageEntry {
        crc32: page_crc,
        size: 1,
    }])
    .unwrap()
}

fn stored(book: BookId, location: &str, size_bytes: u64) -> StoredFile {
    StoredFile {
        book,
        location: Path::new(location).to_path_buf(),
        size_bytes,
        modified_at_ms: MODIFIED_AT_MS,
    }
}

#[tokio::test]
async fn lists_every_file_the_catalog_holds_for_the_root() {
    let library = Library::open("root-files");
    let comics = library.add_root(COMICS).await;
    let manga = library.add_root(MANGA).await;
    let first = library.record(comics, "Sample Series 01/v01.cbz", 1).await;
    let second = library.record(comics, "Sample Series 01/v02.cbz", 2).await;
    library.record(manga, "Sample Series 01/v03.cbz", 3).await;

    let files = library.files(comics).await;

    assert_eq!(
        files,
        [
            stored(first, "Sample Series 01/v01.cbz", 100),
            stored(second, "Sample Series 01/v02.cbz", 200),
        ]
    );
}

#[tokio::test]
async fn removes_the_files_at_the_locations_given_and_returns_the_books_they_held() {
    let library = Library::open("remove-root-files");
    let comics = library.add_root(COMICS).await;
    let first = library.record(comics, "Sample Series 01/v01.cbz", 1).await;
    let second = library.record(comics, "Sample Series 01/v02.cbz", 2).await;
    let kept = library.record(comics, "Sample Series 01/v03.cbz", 3).await;

    let mut held = library
        .remove_files(
            comics,
            &["Sample Series 01/v01.cbz", "Sample Series 01/v02.cbz"],
        )
        .await;

    held.sort();
    let mut expected = vec![first, second];
    expected.sort();
    assert_eq!(held, expected);
    assert_eq!(
        library.files(comics).await,
        [stored(kept, "Sample Series 01/v03.cbz", 300)]
    );
}

#[tokio::test]
async fn leaves_the_file_another_root_holds_at_the_same_location() {
    let library = Library::open("remove-root-files-other-root");
    let comics = library.add_root(COMICS).await;
    let manga = library.add_root(MANGA).await;
    library.record(comics, "Sample Series 01/v01.cbz", 1).await;
    let in_manga = library.record(manga, "Sample Series 01/v01.cbz", 2).await;

    library
        .remove_files(comics, &["Sample Series 01/v01.cbz"])
        .await;

    assert_eq!(
        library.files(manga).await,
        [stored(in_manga, "Sample Series 01/v01.cbz", 200)]
    );
}

#[tokio::test]
async fn removes_only_the_books_no_file_holds_any_more() {
    let library = Library::open("remove-fileless-books");
    let comics = library.add_root(COMICS).await;
    let manga = library.add_root(MANGA).await;
    library.record(comics, "Sample Series 01/v01.cbz", 1).await;
    let copied = library.record(comics, "Sample Series 01/v02.cbz", 2).await;
    library.record(manga, "Sample Series 01/v02.cbz", 2).await;
    let untouched = library.record(comics, "Sample Series 01/v03.cbz", 3).await;
    let held = library
        .remove_files(
            comics,
            &["Sample Series 01/v01.cbz", "Sample Series 01/v02.cbz"],
        )
        .await;

    let removed = library.remove_fileless(held).await;

    assert_eq!(
        library.book_ids().await,
        BTreeSet::from([copied, untouched])
    );
    assert_eq!(removed, 1);
}

#[tokio::test]
async fn lists_no_files_for_a_root_without_books() {
    let library = Library::open("root-files-empty");
    let comics = library.add_root(COMICS).await;

    let files = library.files(comics).await;

    assert!(files.is_empty());
}
