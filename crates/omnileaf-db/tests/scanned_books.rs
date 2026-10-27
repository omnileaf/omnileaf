#![expect(
    clippy::unwrap_used,
    reason = "each test builds its own scratch library, so a failed set-up should stop the test"
)]

mod support;

use std::path::PathBuf;

use omnileaf_db::{
    Database, Error,
    catalog::{
        AgeRating, BookDetails, BookFile, BookListing, BookPerson, NewBook, NewRoot, NewSeries,
        PageRequest, PageSize, PersonRole, ReadingDirection, RootId, RootKind, RootLocator,
        ScannedBook, add_book, add_root, record_moved_books, record_page_count,
        record_scanned_books, series_books,
    },
    rusqlite::{Row, types::Value},
};
use omnileaf_sync_proto::{BookId, Fingerprint, ImageEntry, SeriesId, SourceId};
use support::{ScratchFolder, library_config};

const ADDED_AT_MS: i64 = 1_790_000_000_000;
const MODIFIED_AT_MS: i64 = 1_780_000_000_000;
const PAGE_COUNT: u32 = 24;
const PAGE_COUNT_AFTER_EDIT: u32 = 26;

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
        let database = Database::open(&library_config(&folder)).unwrap();
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
            page_count: PAGE_COUNT,
            details: BookDetails::default(),
            file: BookFile {
                root: self.root,
                location: location.into(),
                size_bytes: u64::from(page_crc) * 100,
                modified_at_ms: MODIFIED_AT_MS,
            },
        }
    }

    async fn record(&self, scanned: ScannedBook) -> SeriesId {
        let filed_in = self
            .database
            .write(move |transaction| record_scanned_books(transaction, &[scanned]))
            .await
            .unwrap();
        *filed_in.first().unwrap()
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

    async fn page_counts(&self, series: SeriesId) -> Vec<Option<u32>> {
        let request = PageRequest {
            after: None,
            size: PageSize::try_from(10).unwrap(),
        };
        let page = self
            .database
            .read(move |connection| {
                series_books(connection, series, BookListing::IN_ORDER, &request)
            })
            .await
            .unwrap();
        page.items.into_iter().map(|book| book.page_count).collect()
    }

    async fn details(&self) -> Vec<Vec<Value>> {
        self.rows(
            "SELECT series, number, title, volume, summary, publisher, format, language,
                reading_direction, age_rating, year
            FROM book_details ORDER BY book_id",
            |row| {
                (0..row.as_ref().column_count())
                    .map(|column| row.get(column))
                    .collect()
            },
        )
        .await
    }

    async fn people(&self) -> Vec<(String, String)> {
        self.rows(
            "SELECT role, name FROM book_person ORDER BY role, name",
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .await
    }

    async fn tags(&self) -> Vec<(String, String)> {
        self.rows(
            "SELECT kind, name FROM book_tag ORDER BY kind, name",
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .await
    }

    async fn changes_recording(&self, scanned: ScannedBook) -> u64 {
        self.database
            .write(move |transaction| {
                let before = transaction.total_changes();
                record_scanned_books(transaction, &[scanned])?;
                Ok(transaction.total_changes() - before)
            })
            .await
            .unwrap()
    }

    async fn rows<T: Send + 'static>(
        &self,
        sql: &'static str,
        read: fn(&Row<'_>) -> omnileaf_db::rusqlite::Result<T>,
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

/// Unix stores a path as its raw bytes.
#[cfg(unix)]
fn stored_location(location: &str) -> Vec<u8> {
    location.as_bytes().to_vec()
}

/// Windows stores a path as little-endian UTF-16 units.
#[cfg(windows)]
fn stored_location(location: &str) -> Vec<u8> {
    location.encode_utf16().flat_map(u16::to_le_bytes).collect()
}

fn sample_details() -> BookDetails {
    BookDetails {
        series: Some("Sample Series 01".to_owned()),
        number: Some("1".to_owned()),
        title: Some("Sample Story".to_owned()),
        volume: Some(1),
        summary: Some("A sample summary.".to_owned()),
        people: vec![
            person(PersonRole::Writer, "Sample Author"),
            person(PersonRole::Penciller, "Sample Artist"),
        ],
        publisher: Some("Sample Publisher".to_owned()),
        format: Some("Digital".to_owned()),
        genres: vec!["Mystery".to_owned()],
        tags: vec!["harbour".to_owned()],
        language: Some("en".to_owned()),
        reading_direction: Some(ReadingDirection::RightToLeft),
        age_rating: Some(AgeRating::Teen),
        year: Some(2019),
    }
}

fn person(role: PersonRole, name: &str) -> BookPerson {
    BookPerson {
        role,
        name: name.to_owned(),
    }
}

fn text(value: &str) -> Value {
    Value::Text(value.to_owned())
}

fn pairs(rows: &[(&str, &str)]) -> Vec<(String, String)> {
    rows.iter()
        .map(|(code, name)| ((*code).to_owned(), (*name).to_owned()))
        .collect()
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
            location: stored_location("Sample Series 01/Volume 01.cbz"),
            size_bytes: 100,
            modified_at_ms: MODIFIED_AT_MS,
            rev: 1,
        }]
    );
}

#[tokio::test]
async fn files_each_book_of_a_batch_in_the_series_its_folder_names() {
    let library = Library::open("scanned-batch").await;
    let batch = vec![
        library.found("Sample Series 01", "Sample Series 01/Volume 01.cbz", 1),
        library.found("Sample Series 02", "Sample Series 02/Volume 02.cbz", 2),
        library.found("Sample Series 01", "Sample Series 01/Volume 03.cbz", 3),
    ];
    let expected: Vec<SeriesId> = batch.iter().map(|book| book.series.id()).collect();

    let filed_in = library
        .database
        .write(move |transaction| record_scanned_books(transaction, &batch))
        .await
        .unwrap();

    assert_eq!(filed_in, expected);
    assert_eq!(
        library.series().await,
        [
            ("Sample Series 01".to_owned(), 2),
            ("Sample Series 02".to_owned(), 1)
        ]
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

#[tokio::test]
async fn refiles_a_moved_book_in_the_series_and_under_the_title_of_its_new_place() {
    let library = Library::open("scanned-moved").await;
    library
        .record(library.found("Sample Series 01", "Sample Series 01/Volume 01.cbz", 1))
        .await;
    let mut moved = library.found(
        "Sample Series 02",
        "Sample Series 02/Volume 01 (fixed).cbz",
        1,
    );
    moved.title = "Volume 01 (fixed)".to_owned();
    let new_series = moved.series.id();

    let filed_in = library
        .database
        .write(move |transaction| record_moved_books(transaction, &[moved]))
        .await
        .unwrap();

    assert_eq!(filed_in, [new_series]);
    assert_eq!(
        library.series().await,
        [
            ("Sample Series 01".to_owned(), 0),
            ("Sample Series 02".to_owned(), 1)
        ]
    );
    assert_eq!(library.books().await, ["Volume 01 (fixed)"]);
}

#[tokio::test]
async fn adds_a_moved_book_the_catalog_no_longer_holds() {
    let library = Library::open("scanned-moved-new").await;
    let moved = library.found("Sample Series 02", "Sample Series 02/Volume 01.cbz", 1);

    library
        .database
        .write(move |transaction| record_moved_books(transaction, &[moved]))
        .await
        .unwrap();

    assert_eq!(library.series().await, [("Sample Series 02".to_owned(), 1)]);
    assert_eq!(library.books().await, ["Volume 01"]);
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
        .write(move |transaction| record_scanned_books(transaction, &[found]))
        .await;

    assert!(matches!(outcome, Err(Error::UnknownSeries { id }) if id == series));
    assert!(library.files().await.is_empty());
}

#[tokio::test]
async fn keeps_how_many_pages_each_book_a_scan_found_holds() {
    let library = Library::open("scanned-page-count").await;

    let series = library
        .record(library.found("Sample Series 01", "Sample Series 01/Volume 01.cbz", 1))
        .await;

    assert_eq!(library.page_counts(series).await, [Some(PAGE_COUNT)]);
}

#[tokio::test]
async fn counts_a_moved_book_s_pages_as_its_new_place_holds_them() {
    let library = Library::open("moved-page-count").await;
    let series = library
        .record(library.found("Sample Series 01", "Sample Series 01/Volume 01.cbz", 1))
        .await;
    let moved = ScannedBook {
        page_count: PAGE_COUNT_AFTER_EDIT,
        ..library.found("Sample Series 01", "Sample Series 01/Volume 1.cbz", 1)
    };

    library
        .database
        .write(move |transaction| record_moved_books(transaction, &[moved]))
        .await
        .unwrap();

    assert_eq!(
        library.page_counts(series).await,
        [Some(PAGE_COUNT_AFTER_EDIT)]
    );
}

#[tokio::test]
async fn knows_no_page_count_for_a_book_added_without_one_until_it_is_recorded() {
    let library = Library::open("recorded-page-count").await;
    let series = NewSeries::local("Sample Series 01", ADDED_AT_MS).unwrap();
    let book = NewBook {
        fingerprint: fingerprint(1),
        series: series.id(),
        title: "Volume 01".to_owned(),
        added_at_ms: ADDED_AT_MS,
        page_count: None,
    };
    let id = book.id();
    library
        .database
        .write(move |transaction| {
            omnileaf_db::catalog::add_series(transaction, &series)?;
            add_book(transaction, &book)
        })
        .await
        .unwrap();
    let before = library
        .page_counts(SeriesId::local("Sample Series 01").unwrap())
        .await;

    library
        .database
        .write(move |transaction| record_page_count(transaction, id, PAGE_COUNT))
        .await
        .unwrap();

    let after = library
        .page_counts(SeriesId::local("Sample Series 01").unwrap())
        .await;
    assert_eq!((before, after), (vec![None], vec![Some(PAGE_COUNT)]));
}

#[tokio::test]
async fn keeps_the_details_a_scan_read_from_a_book() {
    let library = Library::open("scanned-details").await;
    let found = ScannedBook {
        details: sample_details(),
        ..library.found("Sample Series 01", "Sample Series 01/Volume 01.cbz", 1)
    };

    library.record(found).await;

    assert_eq!(
        library.details().await,
        [vec![
            text("Sample Series 01"),
            text("1"),
            text("Sample Story"),
            Value::Integer(1),
            text("A sample summary."),
            text("Sample Publisher"),
            text("Digital"),
            text("en"),
            text("right_to_left"),
            text("teen"),
            Value::Integer(2019),
        ]]
    );
    assert_eq!(
        library.people().await,
        pairs(&[("penciller", "Sample Artist"), ("writer", "Sample Author")])
    );
    assert_eq!(
        library.tags().await,
        pairs(&[("genre", "Mystery"), ("tag", "harbour")])
    );
}

#[tokio::test]
async fn marks_a_book_whose_files_give_no_details_as_read_for_them() {
    let library = Library::open("scanned-no-details").await;

    library
        .record(library.found("Sample Series 01", "Sample Series 01/Volume 01.cbz", 1))
        .await;

    assert_eq!(library.details().await, [vec![Value::Null; 11]]);
}

#[tokio::test]
async fn keeps_the_details_a_book_gives_when_scanned_again() {
    let library = Library::open("scanned-details-again").await;
    let location = "Sample Series 01/Volume 01.cbz";
    library
        .record(ScannedBook {
            details: sample_details(),
            ..library.found("Sample Series 01", location, 1)
        })
        .await;
    let edited = BookDetails {
        summary: None,
        people: vec![
            person(PersonRole::Writer, "Sample Author"),
            person(PersonRole::Inker, "Second Artist"),
        ],
        tags: vec!["storms".to_owned()],
        ..sample_details()
    };

    library
        .record(ScannedBook {
            details: edited,
            ..library.found("Sample Series 01", location, 1)
        })
        .await;

    assert_eq!(library.details().await[0][4], Value::Null);
    assert_eq!(
        library.people().await,
        pairs(&[("inker", "Second Artist"), ("writer", "Sample Author")])
    );
    assert_eq!(
        library.tags().await,
        pairs(&[("genre", "Mystery"), ("tag", "storms")])
    );
}

#[tokio::test]
async fn writes_nothing_when_a_book_is_scanned_again_with_the_same_details() {
    let library = Library::open("scanned-details-unchanged").await;
    let found = ScannedBook {
        details: sample_details(),
        ..library.found("Sample Series 01", "Sample Series 01/Volume 01.cbz", 1)
    };
    library.record(found.clone()).await;

    let changes = library.changes_recording(found).await;

    assert_eq!(changes, 0);
}
