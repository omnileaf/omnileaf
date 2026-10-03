#![expect(
    clippy::unwrap_used,
    reason = "each test builds its own scratch library, so a failed set-up should stop the test"
)]

mod support;

use std::path::PathBuf;

use omnileaf_db::{
    Database, Error,
    catalog::{
        BookFile, NewRoot, NewSeries, RootId, RootKind, RootLocator, ScannedBook, add_root,
        record_scanned_book,
    },
};
use omnileaf_sync_proto::{BookId, Fingerprint, ImageEntry, SeriesId, SourceId};
use support::ScratchFolder;

const ADDED_AT_MS: i64 = 1_790_000_000_000;
const MODIFIED_AT_MS: i64 = 1_780_000_000_000;

struct Library {
    database: Database,
    root: RootId,
    _folder: ScratchFolder,
}

#[derive(Debug, PartialEq, Eq)]
struct StoredFile {
    book: Vec<u8>,
    location: Vec<u8>,
    size_bytes: i64,
    modified_at_ms: i64,
    rev: i64,
}

impl Library {
    async fn open(name: &str) -> Self {
        let folder = ScratchFolder::new(name);
        let database = Database::open(&folder.config()).unwrap();
        let root = NewRoot {
            kind: RootKind::Linked,
            locator: RootLocator::Path(PathBuf::from("/media/Sample Library")),
            added_at_ms: ADDED_AT_MS,
        };
        let root = database
            .write(move |transaction| add_root(transaction, &root))
            .await
            .unwrap();
        Self {
            database,
            root,
            _folder: folder,
        }
    }

    fn found(&self, series: &str, location: impl Into<PathBuf>, page_crc: u32) -> ScannedBook {
        ScannedBook {
            series: NewSeries::local(series, ADDED_AT_MS).unwrap(),
            fingerprint: fingerprint(page_crc),
            title: format!("Volume {page_crc:02}"),
            added_at_ms: ADDED_AT_MS,
            file: BookFile {
                root: self.root,
                location: location.into(),
                size_bytes: u64::from(page_crc) * 100,
                modified_at_ms: MODIFIED_AT_MS,
            },
        }
    }

    async fn record(&self, scanned: ScannedBook) -> SeriesId {
        self.database
            .write(move |transaction| record_scanned_book(transaction, &scanned))
            .await
            .unwrap()
    }

    async fn series(&self) -> Vec<(String, i64)> {
        self.rows(
            "SELECT title, book_count FROM series ORDER BY local_id",
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .await
    }

    async fn books(&self) -> Vec<String> {
        self.rows("SELECT title FROM book ORDER BY title", |row| row.get(0))
            .await
    }

    async fn files(&self) -> Vec<StoredFile> {
        self.rows(
            "SELECT book_id, location, size_bytes, modified_at_ms, rev FROM book_file ORDER BY id",
            |row| {
                Ok(StoredFile {
                    book: row.get(0)?,
                    location: row.get(1)?,
                    size_bytes: row.get(2)?,
                    modified_at_ms: row.get(3)?,
                    rev: row.get(4)?,
                })
            },
        )
        .await
    }

    async fn rows<T: Send + 'static>(
        &self,
        sql: &'static str,
        read: fn(&omnileaf_db::rusqlite::Row<'_>) -> omnileaf_db::rusqlite::Result<T>,
    ) -> Vec<T> {
        self.database
            .read(move |connection| {
                Ok(connection
                    .prepare(sql)?
                    .query_map([], read)?
                    .collect::<Result<_, _>>()?)
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

fn book_id(page_crc: u32) -> Vec<u8> {
    BookId::local(&fingerprint(page_crc)).as_bytes().to_vec()
}

#[tokio::test]
async fn adds_the_series_the_book_and_the_file_a_scan_found() {
    let library = Library::open("scanned-new").await;

    library
        .record(library.found("Sample Series 01", "Sample Series 01/Volume 01.cbz", 1))
        .await;

    assert_eq!(library.series().await, [("Sample Series 01".to_owned(), 1)]);
    assert_eq!(library.books().await, ["Volume 01"]);
    assert_eq!(
        library.files().await,
        [StoredFile {
            book: book_id(1),
            location: b"Sample Series 01/Volume 01.cbz".to_vec(),
            size_bytes: 100,
            modified_at_ms: MODIFIED_AT_MS,
            rev: 1,
        }]
    );
}

#[tokio::test]
async fn keeps_one_book_and_one_file_when_a_file_is_scanned_again() {
    let library = Library::open("scanned-again").await;
    let found = library.found("Sample Series 01", "Sample Series 01/Volume 01.cbz", 1);
    library.record(found.clone()).await;

    library.record(found).await;

    assert_eq!(library.series().await, [("Sample Series 01".to_owned(), 1)]);
    assert_eq!(library.books().await, ["Volume 01"]);
    assert_eq!(
        library
            .files()
            .await
            .iter()
            .map(|file| file.rev)
            .collect::<Vec<_>>(),
        [1]
    );
}

#[tokio::test]
async fn points_a_changed_file_at_the_book_it_now_holds_and_counts_up_its_revision() {
    let library = Library::open("scanned-changed").await;
    let location = "Sample Series 01/Volume 01.cbz";
    library
        .record(library.found("Sample Series 01", location, 1))
        .await;

    library
        .record(library.found("Sample Series 01", location, 2))
        .await;

    let files = library.files().await;
    assert_eq!(
        files
            .iter()
            .map(|file| (file.book.clone(), file.size_bytes, file.rev))
            .collect::<Vec<_>>(),
        [(book_id(2), 200, 2)]
    );
}

#[tokio::test]
async fn adds_books_from_folders_whose_names_normalise_alike_to_one_series() {
    let library = Library::open("scanned-shared-series").await;
    library
        .record(library.found("Sample Series 01", "Sample Series 01/Volume 01.cbz", 1))
        .await;

    library
        .record(library.found(
            "SAMPLE  series 01",
            "Elsewhere/SAMPLE  series 01/Volume 02.cbz",
            2,
        ))
        .await;

    assert_eq!(library.series().await, [("Sample Series 01".to_owned(), 2)]);
}

#[tokio::test]
async fn files_a_book_found_again_in_another_series_where_it_was_first_found() {
    let library = Library::open("scanned-elsewhere").await;
    let first = library.found("Sample Series 01", "Sample Series 01/Volume 01.cbz", 1);
    let first_series = first.series.id();
    library.record(first).await;

    let filed_in = library
        .record(library.found("Sample Series 02", "Sample Series 02/Volume 01.cbz", 1))
        .await;

    assert_eq!(filed_in, first_series);
}

#[cfg(unix)]
#[tokio::test]
async fn keeps_a_book_file_location_that_is_not_unicode_byte_for_byte() {
    use std::{ffi::OsString, os::unix::ffi::OsStringExt};
    let library = Library::open("scanned-bytes").await;
    let location = b"Sample Series 01/Volume \xff.cbz".to_vec();

    library
        .record(library.found("Sample Series 01", OsString::from_vec(location.clone()), 1))
        .await;

    assert_eq!(
        library
            .files()
            .await
            .into_iter()
            .map(|file| file.location)
            .collect::<Vec<_>>(),
        [location]
    );
}

#[tokio::test]
async fn refuses_a_book_whose_series_name_is_held_by_another_series_id() {
    let library = Library::open("scanned-name-taken").await;
    library
        .database
        .write(|transaction| {
            Ok(transaction.execute(
                "INSERT INTO series (id, source_id, natural_key, title, title_key, added_at_ms)
                 VALUES (zeroblob(16), ?1, 'sample series 01', 'Sample Series 01', x'', 0)",
                [SourceId::local().as_bytes()],
            )?)
        })
        .await
        .unwrap();
    let found = library.found("Sample Series 01", "Sample Series 01/Volume 01.cbz", 1);
    let series = found.series.id();

    let outcome = library
        .database
        .write(move |transaction| record_scanned_book(transaction, &found))
        .await;

    assert!(matches!(outcome, Err(Error::UnknownSeries { id }) if id == series));
    assert!(library.files().await.is_empty());
}
