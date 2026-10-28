#![expect(
    clippy::unwrap_used,
    reason = "each test builds its own scratch library, so a failed set-up should stop the test"
)]

mod support;

use std::path::PathBuf;

use omnileaf_db::{
    Database,
    catalog::{
        BookDetails, BookFile, BookListing, NewRoot, NewSeries, PageRequest, PageSize, RootId,
        RootKind, RootLocator, ScannedBook, add_root, record_scanned_books, series_books, up_next,
    },
};
use omnileaf_sync_proto::{BookId, Fingerprint, ImageEntry, SeriesId};
use support::{ScratchFolder, library_config};

const ADDED_AT_MS: i64 = 1_790_000_000_000;
const SERIES: &str = "Sample Series 01";
const FIRST_REV: u32 = 1;

struct Library {
    database: Database,
    root: RootId,
    _folder: ScratchFolder,
}

impl Library {
    async fn with_books(name: &str, numbers: &[u32]) -> Self {
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
        let library = Self {
            database,
            root,
            _folder: folder,
        };
        let scanned: Vec<ScannedBook> = numbers
            .iter()
            .map(|&number| library.found(number))
            .collect();
        library
            .database
            .write(move |transaction| record_scanned_books(transaction, &scanned))
            .await
            .unwrap();
        library
    }

    fn found(&self, number: u32) -> ScannedBook {
        ScannedBook {
            series: NewSeries::local(SERIES, ADDED_AT_MS).unwrap(),
            named_series: None,
            fingerprint: fingerprint_of(number),
            title: format!("Volume {number:02}"),
            added_at_ms: ADDED_AT_MS,
            page_count: 1,
            details: BookDetails::default(),
            file: BookFile {
                root: self.root,
                location: PathBuf::from(format!("{SERIES}/Volume {number:02}.cbz")),
                size_bytes: 1,
                modified_at_ms: ADDED_AT_MS,
            },
            numbering: None,
            name_language: None,
        }
    }

    async fn drop_files_of(&self, number: u32) {
        let book = book_id(number);
        self.database
            .write(move |transaction| {
                transaction.execute(
                    "DELETE FROM book_file WHERE book_id = ?1",
                    [book.as_bytes()],
                )?;
                Ok(())
            })
            .await
            .unwrap();
    }

    async fn listed_covers(&self) -> Vec<(BookId, Option<(BookId, u32)>)> {
        let request = PageRequest {
            after: None,
            size: PageSize::try_from(10).unwrap(),
        };
        let series = series_id();
        let page = self
            .database
            .read(move |connection| {
                series_books(connection, series, BookListing::IN_ORDER, &request)
            })
            .await
            .unwrap();
        page.items
            .into_iter()
            .map(|book| (book.id, book.cover.map(|cover| (cover.book, cover.rev))))
            .collect()
    }

    async fn up_next_cover(&self) -> Option<(BookId, u32)> {
        let series = series_id();
        self.database
            .read(move |connection| up_next(connection, series))
            .await
            .unwrap()
            .and_then(|book| book.cover)
            .map(|cover| (cover.book, cover.rev))
    }
}

fn fingerprint_of(number: u32) -> Fingerprint {
    Fingerprint::pmf1([ImageEntry {
        crc32: number,
        size: 1,
    }])
    .unwrap()
}

fn book_id(number: u32) -> BookId {
    BookId::local(&fingerprint_of(number))
}

fn series_id() -> SeriesId {
    NewSeries::local(SERIES, ADDED_AT_MS).unwrap().id()
}

#[tokio::test]
async fn lists_each_series_book_with_its_own_cover_and_none_for_a_book_with_no_file() {
    let library = Library::with_books("series-book-covers", &[1, 2, 3]).await;
    library.drop_files_of(2).await;

    let covers = library.listed_covers().await;

    assert_eq!(
        covers,
        [
            (book_id(1), Some((book_id(1), FIRST_REV))),
            (book_id(2), None),
            (book_id(3), Some((book_id(3), FIRST_REV))),
        ]
    );
}

#[tokio::test]
async fn shows_the_book_up_next_by_its_own_cover() {
    let library = Library::with_books("up-next-cover", &[1, 2]).await;

    let cover = library.up_next_cover().await;

    assert_eq!(cover, Some((book_id(1), FIRST_REV)));
}
