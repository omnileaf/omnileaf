#![expect(
    clippy::unwrap_used,
    reason = "each test builds its own scratch library, so a failed set-up should stop the test"
)]

mod support;

use std::path::PathBuf;

use omnileaf_db::{
    Database,
    catalog::{
        BookDetails, BookFile, BookPerson, Cursor, NewRoot, NewSeries, PageRequest, PageSize,
        PersonRole, RootId, RootKind, RootLocator, ScannedBook, WriterSummary, add_root,
        record_scanned_books, writers,
    },
};
use omnileaf_sync_proto::{Fingerprint, ImageEntry};
use support::{ScratchFolder, library_config};

const MODIFIED_AT_MS: i64 = 1_780_000_000_000;

struct Library {
    database: Database,
    _folder: ScratchFolder,
}

impl Library {
    async fn with_books(name: &str, books: &[(&str, &[&str])]) -> Self {
        let folder = ScratchFolder::new(name);
        let database = Database::open(&library_config(&folder)).unwrap();
        let root = NewRoot {
            kind: RootKind::Linked,
            locator: RootLocator::Path(PathBuf::from("/media/Comics")),
            added_at_ms: MODIFIED_AT_MS,
        };
        let root = database
            .write(move |transaction| add_root(transaction, &root))
            .await
            .unwrap();
        let scanned: Vec<ScannedBook> = (1..)
            .zip(books)
            .map(|(crc, (series, writers))| scanned_book(root, crc, series, writers))
            .collect();
        database
            .write(move |transaction| record_scanned_books(transaction, &scanned))
            .await
            .unwrap();
        Self {
            database,
            _folder: folder,
        }
    }

    async fn page(&self, after: Option<Cursor>, size: u16) -> (Vec<WriterSummary>, Option<Cursor>) {
        let request = PageRequest {
            after,
            size: PageSize::try_from(size).unwrap(),
        };
        let page = self
            .database
            .read(move |connection| writers(connection, &request))
            .await
            .unwrap();
        (page.items, page.next)
    }
}

fn scanned_book(root: RootId, crc: u32, series: &str, writers: &[&str]) -> ScannedBook {
    ScannedBook {
        series: NewSeries::local(series, 0).unwrap(),
        fingerprint: Fingerprint::pmf1([ImageEntry {
            crc32: crc,
            size: 100,
        }])
        .unwrap(),
        title: format!("Volume {crc:02}"),
        added_at_ms: 0,
        page_count: 1,
        details: BookDetails {
            people: writers
                .iter()
                .map(|name| BookPerson {
                    role: PersonRole::Writer,
                    name: (*name).to_owned(),
                })
                .collect(),
            ..BookDetails::default()
        },
        numbering: None,
        file: BookFile {
            root,
            location: PathBuf::from(format!("{series}/Volume {crc:02}.cbz")),
            size_bytes: 100,
            modified_at_ms: MODIFIED_AT_MS,
        },
    }
}

fn writer(name: &str, series_count: u32) -> WriterSummary {
    WriterSummary {
        name: name.to_owned(),
        series_count,
    }
}

#[tokio::test]
async fn lists_the_writers_a_scan_recorded_in_title_order_with_the_series_naming_each() {
    let library = Library::with_books(
        "writers-in-order",
        &[
            ("Sample Series 01", &["Sample Author 10", "sample author 2"]),
            ("Sample Series 02", &["Sample Author 10"]),
            ("Sample Series 02", &["Sample Author 10"]),
        ],
    )
    .await;

    let (listed, next) = library.page(None, 10).await;

    assert_eq!(
        (listed, next),
        (
            vec![writer("sample author 2", 1), writer("Sample Author 10", 2)],
            None
        )
    );
}

#[tokio::test]
async fn pages_through_the_writers_with_a_cursor() {
    let library = Library::with_books(
        "writers-paged",
        &[("Sample Series 01", &["Sample Author A", "Sample Author B"])],
    )
    .await;

    let (first, next) = library.page(None, 1).await;
    let (second, last) = library.page(next, 1).await;

    assert_eq!(
        (first, second, last),
        (
            vec![writer("Sample Author A", 1)],
            vec![writer("Sample Author B", 1)],
            None
        )
    );
}
