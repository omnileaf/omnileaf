#![expect(
    clippy::unwrap_used,
    reason = "each test builds its own scratch library, so a failed set-up should stop the test"
)]

mod support;

use std::path::PathBuf;

use omnileaf_db::{
    Database, Error,
    catalog::{
        BookDetails, BookFile, BookPerson, Cursor, NewRoot, NewSeries, Page, PageRequest, PageSize,
        PersonRole, RootId, RootKind, RootLocator, ScannedBook, SeriesFilter, SeriesListing,
        SeriesOrder, SeriesSort, WriterSummary, add_root, record_scanned_books, remove_book_files,
        remove_books_without_files, series_page, writer_series_count, writer_series_page, writers,
    },
    store::{Clock, Store},
};
use omnileaf_sync_proto::{Fingerprint, ImageEntry};
use support::{ScratchFolder, library_config};

const MODIFIED_AT_MS: i64 = 1_780_000_000_000;
const A_TO_Z: SeriesListing = SeriesListing::unfiltered(SeriesSort::ascending(SeriesOrder::Title));
const EVERY_ORDER: [SeriesOrder; 6] = [
    SeriesOrder::Title,
    SeriesOrder::DateAdded,
    SeriesOrder::LastRead,
    SeriesOrder::LastUpdated,
    SeriesOrder::UnreadCount,
    SeriesOrder::TimeLeft,
];

struct StoppedClock;

impl Clock for StoppedClock {
    fn now_unix_ms(&self) -> u64 {
        0
    }
}

struct Library {
    store: Store,
    root: RootId,
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
            store: Store::new(database, StoppedClock),
            root,
            _folder: folder,
        }
    }

    async fn page(&self, after: Option<Cursor>, size: u16) -> (Vec<WriterSummary>, Option<Cursor>) {
        let page = self.try_page(after, size).await.unwrap();
        (page.items, page.next)
    }

    async fn try_page(
        &self,
        after: Option<Cursor>,
        size: u16,
    ) -> Result<Page<WriterSummary>, Error> {
        let request = PageRequest {
            after: after.map(|cursor| cursor.to_string().parse().unwrap()),
            size: PageSize::try_from(size).unwrap(),
        };
        self.store
            .database()
            .read(move |connection| writers(connection, &request))
            .await
    }

    async fn first_series_cursor_of(&self, writer: &'static str) -> Option<Cursor> {
        let request = PageRequest {
            after: None,
            size: PageSize::try_from(1).unwrap(),
        };
        self.store
            .database()
            .read(move |connection| writer_series_page(connection, writer, &A_TO_Z, &request))
            .await
            .unwrap()
            .next
    }

    async fn try_library_page(
        &self,
        order: SeriesOrder,
        after: Option<Cursor>,
    ) -> Result<(), Error> {
        let listing = SeriesListing::unfiltered(SeriesSort::ascending(order));
        let request = PageRequest {
            after,
            size: PageSize::try_from(1).unwrap(),
        };
        self.store
            .database()
            .read(move |connection| series_page(connection, &listing, &request).map(drop))
            .await
    }

    async fn remove_book(&self, location: &str) {
        let root = self.root;
        let location = PathBuf::from(location);
        self.store
            .database()
            .write(move |transaction| {
                let books = remove_book_files(transaction, root, &[location])?;
                remove_books_without_files(transaction, &books)
            })
            .await
            .unwrap();
    }

    async fn sort_names_for(&self, language: &str) {
        self.store
            .sort_titles_for(language.parse().unwrap())
            .await
            .unwrap();
    }

    async fn series_of(&self, writer: &'static str) -> (Vec<String>, u32) {
        let request = PageRequest {
            after: None,
            size: PageSize::try_from(10).unwrap(),
        };
        self.store
            .database()
            .read(move |connection| {
                let page = writer_series_page(connection, writer, &A_TO_Z, &request)?;
                let count = writer_series_count(connection, writer, &SeriesFilter::NONE)?;
                let titles = page.items.into_iter().map(|series| series.title).collect();
                Ok((titles, count))
            })
            .await
            .unwrap()
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

fn names(writers: Vec<WriterSummary>) -> Vec<String> {
    writers.into_iter().map(|writer| writer.name).collect()
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

#[tokio::test]
async fn carries_an_open_cursor_on_past_a_writer_whose_last_book_went() {
    let library = Library::with_books(
        "writer-gone",
        &[
            ("Sample Series 01", &["Sample Author A"]),
            ("Sample Series 02", &["Sample Author B"]),
        ],
    )
    .await;
    let (first, next) = library.page(None, 1).await;
    library.remove_book("Sample Series 01/Volume 01.cbz").await;

    let (rest, last) = library.page(next, 1).await;

    assert_eq!(
        (first, rest, last),
        (
            vec![writer("Sample Author A", 1)],
            vec![writer("Sample Author B", 1)],
            None
        )
    );
}

#[tokio::test]
async fn carries_an_open_cursor_on_from_its_writer_s_new_place_once_the_names_are_keyed_again() {
    let library = Library::with_books(
        "writer-rekeyed",
        &[(
            "Sample Series 01",
            &["Zebra", "Ödla", "Bok", "Åsna", "Apelsin"],
        )],
    )
    .await;
    let (first, next) = library.page(None, 2).await;
    library.sort_names_for("sv").await;

    let (rest, _) = library.page(next, 10).await;

    assert_eq!(names(first), ["Apelsin", "Åsna"]);
    assert_eq!(names(rest), ["Ödla"]);
}

#[tokio::test]
async fn refuses_an_open_cursor_whose_writer_went_before_the_names_were_keyed_again() {
    let library = Library::with_books(
        "writer-gone-rekeyed",
        &[
            ("Sample Series 01", &["Åsna"]),
            ("Sample Series 02", &["Bok"]),
        ],
    )
    .await;
    let (_, next) = library.page(None, 1).await;
    library.remove_book("Sample Series 01/Volume 01.cbz").await;
    library.sort_names_for("sv").await;

    let outcome = library.try_page(next, 1).await;

    assert!(matches!(outcome, Err(Error::StaleCursor)), "{outcome:?}");
}

#[tokio::test]
async fn refuses_a_cursor_another_list_gave_out() {
    let library = Library::with_books(
        "writers-other-cursor",
        &[
            ("Sample Series 01", &["Sample Author A"]),
            ("Sample Series 02", &["Sample Author A"]),
        ],
    )
    .await;
    let series_cursor = library.first_series_cursor_of("Sample Author A").await;

    let outcome = library.try_page(series_cursor, 1).await;

    assert!(
        matches!(outcome, Err(Error::CursorForAnotherList)),
        "{outcome:?}"
    );
}

#[tokio::test]
async fn gives_out_a_cursor_no_series_listing_takes() {
    let library = Library::with_books(
        "writers-cursor-elsewhere",
        &[("Sample Series 01", &["Sample Author A", "Sample Author B"])],
    )
    .await;
    let (_, writers_cursor) = library.page(None, 1).await;

    for order in EVERY_ORDER {
        let outcome = library
            .try_library_page(order, writers_cursor.clone())
            .await;

        assert!(
            matches!(outcome, Err(Error::CursorForAnotherList)),
            "{order:?}: {outcome:?}"
        );
    }
}

#[tokio::test]
async fn lists_and_counts_only_the_series_naming_a_writer() {
    let library = Library::with_books(
        "writer-series",
        &[
            ("Sample Series 01", &["Sample Author A", "Sample Author B"]),
            ("Sample Series 02", &["Sample Author A"]),
            ("Sample Series 03", &["Sample Author B"]),
        ],
    )
    .await;

    let named = library.series_of("Sample Author A").await;

    assert_eq!(
        named,
        (
            vec!["Sample Series 01".to_owned(), "Sample Series 02".to_owned()],
            2
        )
    );
}
