#![expect(
    clippy::unwrap_used,
    reason = "each test builds its own scratch library, so a failed set-up should stop the test"
)]

#[expect(
    dead_code,
    reason = "these tests take only the store's clock, book ids and open helper"
)]
mod store_support;
mod support;

use std::path::PathBuf;

use omnileaf_db::{
    catalog::{
        BookDetails, BookFile, BookFileToRemove, NewRoot, NewSeries, RootId, RootKind, RootLocator,
        ScannedBook, add_root, books_of_series, files_of_books, record_scanned_books,
    },
    store::Store,
};
use omnileaf_sync_proto::{BookId, Fingerprint, ImageEntry, SeriesId};
use store_support::{FakeClock, NOW_UNIX_MS, book, open_store};
use support::ScratchFolder;

const ADDED_AT_MS: i64 = 1_780_000_000_000;
const COMICS: &str = "/media/Comics";
const MANGA: &str = "/media/Manga";
const FIRST_SERIES: &str = "Sample Series 01";
const SECOND_SERIES: &str = "Sample Series 02";
const MORE_THAN_ONE_BATCH: u32 = 70;

struct Library {
    store: Store,
    comics: RootId,
    manga: RootId,
    _folder: ScratchFolder,
}

impl Library {
    async fn open(name: &str) -> Self {
        let folder = ScratchFolder::new(name);
        let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
        let comics = add_linked_root(&store, COMICS).await;
        let manga = add_linked_root(&store, MANGA).await;
        Self {
            store,
            comics,
            manga,
            _folder: folder,
        }
    }

    async fn record(&self, root: RootId, series: &str, number: u32) -> BookId {
        self.record_with(root, series, number, BookDetails::default())
            .await
    }

    async fn record_with(
        &self,
        root: RootId,
        series: &str,
        number: u32,
        details: BookDetails,
    ) -> BookId {
        let scanned = ScannedBook {
            series: NewSeries::local(series, ADDED_AT_MS).unwrap(),
            named_series: None,
            fingerprint: fingerprint_of(number),
            title: format!("Volume {number:02}"),
            added_at_ms: ADDED_AT_MS,
            page_count: 1,
            details,
            file: BookFile {
                root,
                location: location_of(series, number),
                size_bytes: stored_size(number),
                modified_at_ms: stamp_of(number),
            },
            numbering: None,
            name_language: None,
        };
        self.store
            .database()
            .write(move |transaction| record_scanned_books(transaction, &[scanned]))
            .await
            .unwrap();
        book(number)
    }

    async fn files_of(&self, books: Vec<BookId>) -> Vec<BookFileToRemove> {
        let mut files = self
            .store
            .database()
            .read(move |connection| files_of_books(connection, &books))
            .await
            .unwrap();
        files.sort_by(|left, right| left.location.cmp(&right.location));
        files
    }

    async fn books_of(&self, series: &str) -> Vec<BookId> {
        let series = SeriesId::local(series).unwrap();
        let mut books = self
            .store
            .database()
            .read(move |connection| books_of_series(connection, series))
            .await
            .unwrap();
        books.sort();
        books
    }
}

async fn add_linked_root(store: &Store, path: &str) -> RootId {
    let root = NewRoot {
        kind: RootKind::Linked,
        locator: RootLocator::Path(PathBuf::from(path)),
        added_at_ms: ADDED_AT_MS,
    };
    store
        .database()
        .write(move |transaction| add_root(transaction, &root))
        .await
        .unwrap()
}

fn fingerprint_of(number: u32) -> Fingerprint {
    Fingerprint::pmf1([ImageEntry {
        crc32: number,
        size: 1,
    }])
    .unwrap()
}

fn location_of(series: &str, number: u32) -> PathBuf {
    PathBuf::from(format!("{series}/Volume {number:02}.cbz"))
}

fn stored_size(number: u32) -> u64 {
    u64::from(number) * 100
}

fn stamp_of(number: u32) -> i64 {
    ADDED_AT_MS + i64::from(number)
}

fn file_to_remove(number: u32, series: &str, (root_id, root): (RootId, &str)) -> BookFileToRemove {
    BookFileToRemove {
        book: book(number),
        root_id,
        root: RootLocator::Path(PathBuf::from(root)),
        location: location_of(series, number),
        size_bytes: stored_size(number),
        modified_at_ms: stamp_of(number),
    }
}

#[tokio::test]
async fn files_of_books_lists_every_file_with_its_root_size_and_stamp() {
    let library = Library::open("files-of-books").await;
    library.record(library.comics, FIRST_SERIES, 1).await;
    library.record(library.comics, FIRST_SERIES, 2).await;
    library.record(library.manga, FIRST_SERIES, 2).await;
    library.record(library.comics, SECOND_SERIES, 3).await;

    let files = library.files_of(vec![book(1), book(2)]).await;

    let comics = (library.comics, COMICS);
    let manga = (library.manga, MANGA);
    assert_eq!(
        files,
        [
            file_to_remove(1, FIRST_SERIES, comics),
            file_to_remove(2, FIRST_SERIES, comics),
            file_to_remove(2, FIRST_SERIES, manga),
        ]
    );
}

#[tokio::test]
async fn files_of_books_finds_the_files_beyond_one_batch_and_none_for_unknown_books() {
    let library = Library::open("files-of-books-many").await;
    for number in 1..=MORE_THAN_ONE_BATCH {
        library.record(library.comics, FIRST_SERIES, number).await;
    }
    let mut asked: Vec<BookId> = (1..=MORE_THAN_ONE_BATCH).map(book).collect();
    asked.push(book(MORE_THAN_ONE_BATCH + 1));

    let files = library.files_of(asked).await;

    assert_eq!(files.len(), usize::try_from(MORE_THAN_ONE_BATCH).unwrap());
}

#[tokio::test]
async fn books_of_series_lists_every_book_of_the_series_and_nothing_else() {
    let library = Library::open("books-of-series").await;
    library.record(library.comics, FIRST_SERIES, 1).await;
    library.record(library.comics, FIRST_SERIES, 2).await;
    library.record(library.comics, SECOND_SERIES, 3).await;

    let books = library.books_of(FIRST_SERIES).await;

    let mut expected = vec![book(1), book(2)];
    expected.sort();
    assert_eq!(books, expected);
}
