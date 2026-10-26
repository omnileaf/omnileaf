#![expect(
    clippy::unwrap_used,
    reason = "each test builds its own scratch library, so a failed set-up should stop the test"
)]

#[expect(
    dead_code,
    reason = "these tests read how far a book was read but never raise its furthest page"
)]
mod store_support;
mod support;

use std::path::{Path, PathBuf};

use omnileaf_db::{
    catalog::{
        BookFile, BookReading, BookToRead, NewRoot, NewSeries, PageDimensions, PlaceInSeries,
        RootId, RootKind, RootLocator, ScannedBook, SeriesNeighbour, add_root, book_to_read,
        page_dimensions, place_in_series, record_scanned_books, remove_book_files,
        store_page_dimensions,
    },
    store::Store,
};
use omnileaf_sync_proto::{BookId, Fingerprint, ImageEntry, SeriesId};
use store_support::{FakeClock, NOW_UNIX_MS, book, open_store, set_position};
use support::ScratchFolder;

const ADDED_AT_MS: i64 = 1_790_000_000_000;
const MODIFIED_AT_MS: i64 = 1_780_000_000_000;
const ROOT_FOLDER: &str = "/media/Sample Library";
const SERIES: &str = "Sample Series 01";
const PORTRAIT: PageDimensions = PageDimensions {
    width: 1800,
    height: 2700,
};
const SPREAD: PageDimensions = PageDimensions {
    width: 3600,
    height: 2700,
};

struct Library {
    store: Store,
    root: RootId,
    _folder: ScratchFolder,
}

impl Library {
    async fn open(name: &str) -> Self {
        let folder = ScratchFolder::new(name);
        let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
        let root = NewRoot {
            kind: RootKind::Linked,
            locator: RootLocator::Path(PathBuf::from(ROOT_FOLDER)),
            added_at_ms: ADDED_AT_MS,
        };
        let root = store
            .database()
            .write(move |transaction| add_root(transaction, &root))
            .await
            .unwrap();
        Self {
            store,
            root,
            _folder: folder,
        }
    }

    async fn record(&self, number: u32, location: PathBuf, size_bytes: u64) {
        let scanned = ScannedBook {
            series: NewSeries::local(SERIES, ADDED_AT_MS).unwrap(),
            fingerprint: Fingerprint::pmf1([ImageEntry {
                crc32: number,
                size: 1,
            }])
            .unwrap(),
            title: title_of(number),
            added_at_ms: ADDED_AT_MS,
            page_count: 1,
            file: BookFile {
                root: self.root,
                location,
                size_bytes,
                modified_at_ms: MODIFIED_AT_MS,
            },
        };
        self.store
            .database()
            .write(move |transaction| record_scanned_books(transaction, &[scanned]))
            .await
            .unwrap();
    }

    async fn to_read(&self, id: BookId) -> Option<BookToRead> {
        self.store
            .database()
            .read(move |connection| book_to_read(connection, id))
            .await
            .unwrap()
    }

    async fn place_of(&self, id: BookId) -> Option<PlaceInSeries> {
        self.store
            .database()
            .read(move |connection| place_in_series(connection, id))
            .await
            .unwrap()
    }

    async fn store_pages(&self, book: &BookToRead, pages: Vec<Option<PageDimensions>>) {
        let (file, rev) = (book.file, book.rev);
        self.store
            .database()
            .write(move |transaction| store_page_dimensions(transaction, file, rev, &pages))
            .await
            .unwrap();
    }

    async fn pages_of(&self, book: &BookToRead) -> Option<Vec<Option<PageDimensions>>> {
        let (file, rev) = (book.file, book.rev);
        self.store
            .database()
            .read(move |connection| page_dimensions(connection, file, rev))
            .await
            .unwrap()
    }
}

fn title_of(number: u32) -> String {
    format!("{SERIES} v{number:02}")
}

type Named = (BookId, String);

fn neighbour(number: u32) -> Named {
    (book(number), title_of(number))
}

fn named(place: Option<PlaceInSeries>) -> Option<(u32, Option<Named>, Option<Named>)> {
    let name = |neighbour: SeriesNeighbour| (neighbour.id, neighbour.title);
    place.map(|place| {
        (
            place.position,
            place.previous.map(name),
            place.next.map(name),
        )
    })
}

fn location_of(number: u32) -> PathBuf {
    Path::new(SERIES).join(format!("{}.cbz", title_of(number)))
}

#[tokio::test]
async fn finds_a_book_its_series_and_the_file_it_is_read_from() {
    let library = Library::open("to-read-found").await;
    library.record(1, location_of(1), 100).await;

    let found = library.to_read(book(1)).await.unwrap();

    assert_eq!(found.id, book(1));
    assert_eq!(found.title, "Sample Series 01 v01");
    assert_eq!(found.series, SeriesId::local(SERIES).unwrap());
    assert_eq!(found.series_title, SERIES);
    assert_eq!(found.rev, 1);
    assert_eq!(found.root, RootLocator::Path(PathBuf::from(ROOT_FOLDER)));
    assert_eq!(found.location, location_of(1));
    assert_eq!(found.reading, BookReading::NotStarted);
}

#[tokio::test]
async fn finds_how_many_pages_the_library_counted_in_a_book() {
    let library = Library::open("to-read-page-count").await;
    library.record(1, location_of(1), 100).await;

    let found = library.to_read(book(1)).await.unwrap();

    assert_eq!(found.page_count, Some(1));
}

#[tokio::test]
async fn finds_nothing_to_read_for_a_book_the_library_does_not_hold() {
    let library = Library::open("to-read-missing").await;
    library.record(1, location_of(1), 100).await;

    let found = library.to_read(book(2)).await;

    assert_eq!(found, None);
}

#[tokio::test]
async fn finds_nothing_to_read_once_a_book_s_file_has_gone() {
    let library = Library::open("to-read-gone").await;
    library.record(1, location_of(1), 100).await;
    let root = library.root;
    library
        .store
        .database()
        .write(move |transaction| remove_book_files(transaction, root, &[location_of(1)]))
        .await
        .unwrap();

    let found = library.to_read(book(1)).await;

    assert_eq!(found, None);
}

#[tokio::test]
async fn reads_a_book_with_two_files_from_the_one_found_first() {
    let library = Library::open("to-read-two-files").await;
    library.record(1, location_of(1), 100).await;
    library
        .record(1, Path::new("Copies").join("Copy.cbz"), 100)
        .await;

    let found = library.to_read(book(1)).await.unwrap();

    assert_eq!(found.location, location_of(1));
}

#[tokio::test]
async fn finds_where_reading_a_book_goes_on_from() {
    let library = Library::open("to-read-started").await;
    library.record(1, location_of(1), 100).await;
    set_position(&library.store, book(1), 13).await.unwrap();

    let found = library.to_read(book(1)).await.unwrap();

    assert_eq!(
        found.reading,
        BookReading::Started {
            position_page: Some(13)
        }
    );
}

#[tokio::test]
async fn reads_back_the_page_sizes_stored_for_a_book_s_file() {
    let library = Library::open("pages-stored").await;
    library.record(1, location_of(1), 100).await;
    let found = library.to_read(book(1)).await.unwrap();
    let pages = vec![Some(PORTRAIT), None, Some(SPREAD)];

    library.store_pages(&found, pages.clone()).await;

    assert_eq!(library.pages_of(&found).await, Some(pages));
}

#[tokio::test]
async fn knows_no_page_sizes_for_a_file_none_were_stored_for() {
    let library = Library::open("pages-unknown").await;
    library.record(1, location_of(1), 100).await;
    let found = library.to_read(book(1)).await.unwrap();

    let pages = library.pages_of(&found).await;

    assert_eq!(pages, None);
}

#[tokio::test]
async fn forgets_the_page_sizes_of_a_file_once_it_changes() {
    let library = Library::open("pages-changed").await;
    library.record(1, location_of(1), 100).await;
    let before = library.to_read(book(1)).await.unwrap();
    library.store_pages(&before, vec![Some(PORTRAIT)]).await;

    library.record(1, location_of(1), 150).await;

    let after = library.to_read(book(1)).await.unwrap();
    assert_eq!(after.rev, before.rev + 1);
    assert_eq!(library.pages_of(&after).await, None);
}

#[tokio::test]
async fn replaces_the_page_sizes_stored_for_an_older_revision() {
    let library = Library::open("pages-replaced").await;
    library.record(1, location_of(1), 100).await;
    let before = library.to_read(book(1)).await.unwrap();
    library.store_pages(&before, vec![Some(PORTRAIT)]).await;
    library.record(1, location_of(1), 150).await;
    let after = library.to_read(book(1)).await.unwrap();

    library
        .store_pages(&after, vec![Some(SPREAD), Some(SPREAD)])
        .await;

    assert_eq!(
        library.pages_of(&after).await,
        Some(vec![Some(SPREAD), Some(SPREAD)])
    );
    assert_eq!(library.pages_of(&before).await, None);
}

#[tokio::test]
async fn forgets_the_page_sizes_of_a_file_removed_from_the_library() {
    let library = Library::open("pages-removed").await;
    library.record(1, location_of(1), 100).await;
    let found = library.to_read(book(1)).await.unwrap();
    library.store_pages(&found, vec![Some(PORTRAIT)]).await;
    let root = library.root;

    library
        .store
        .database()
        .write(move |transaction| remove_book_files(transaction, root, &[location_of(1)]))
        .await
        .unwrap();

    assert_eq!(library.pages_of(&found).await, None);
}

#[tokio::test]
async fn places_a_book_in_its_series_between_the_books_either_side_in_title_order() {
    let library = Library::open("place-between").await;
    for number in [3, 1, 2] {
        library.record(number, location_of(number), 100).await;
    }

    let place = library.place_of(book(2)).await;

    assert_eq!(
        named(place),
        Some((2, Some(neighbour(1)), Some(neighbour(3))))
    );
}

#[tokio::test]
async fn shows_the_next_book_by_its_own_cover_and_how_far_it_was_read() {
    let library = Library::open("place-next-cover").await;
    for number in [1, 2] {
        library.record(number, location_of(number), 100).await;
    }
    set_position(&library.store, book(2), 13).await.unwrap();

    let next = library.place_of(book(1)).await.and_then(|place| place.next);

    assert_eq!(
        next.map(|next| (
            next.cover.map(|cover| (cover.book, cover.rev)),
            next.reading
        )),
        Some((
            Some((book(2), 1)),
            BookReading::Started {
                position_page: Some(13)
            }
        ))
    );
}

#[tokio::test]
async fn gives_the_first_book_none_before_it_and_the_last_none_after_it() {
    let library = Library::open("place-ends").await;
    for number in [1, 2] {
        library.record(number, location_of(number), 100).await;
    }

    let first = library.place_of(book(1)).await;
    let last = library.place_of(book(2)).await;

    assert_eq!(named(first), Some((1, None, Some(neighbour(2)))));
    assert_eq!(named(last), Some((2, Some(neighbour(1)), None)));
}

#[tokio::test]
async fn finds_no_place_for_a_book_the_library_does_not_hold() {
    let library = Library::open("place-missing").await;
    library.record(1, location_of(1), 100).await;

    let place = library.place_of(book(2)).await;

    assert_eq!(place, None);
}
