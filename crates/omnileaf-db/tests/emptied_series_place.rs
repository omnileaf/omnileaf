#![expect(
    clippy::unwrap_used,
    reason = "each test builds its own scratch library, so a failed set-up should stop the test"
)]

#[expect(
    dead_code,
    reason = "these tests take only the store's clock and open helper"
)]
mod store_support;
mod support;

use std::path::PathBuf;

use omnileaf_db::{
    catalog::{
        BookDetails, BookFile, EmptiedPlace, NewRoot, NewSeries, RootId, RootKind, RootLocator,
        ScannedBook, add_root, emptied_series_place, record_scanned_books, remove_book_files,
        remove_books_without_files, remove_root,
    },
    store::Store,
};
use omnileaf_sync_proto::{BookId, Fingerprint, ImageEntry, SeriesId};
use store_support::{FakeClock, NOW_UNIX_MS, open_store};
use support::ScratchFolder;

const ADDED_AT_MS: i64 = 1_780_000_000_000;
const MODIFIED_AT_MS: i64 = 1_770_000_000_000;
const COMICS: &str = "/media/Comics";
const MANGA: &str = "/media/Manga";
const EMPTIED: &str = "Sample Series 01";
const OTHER: &str = "Sample Series 02";

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

    async fn record(&self, root: RootId, series: &str, location: &str, number: u32) -> BookId {
        let scanned = ScannedBook {
            series: NewSeries::local(series, ADDED_AT_MS).unwrap(),
            named_series: None,
            fingerprint: fingerprint_of(number),
            title: format!("Volume {number:02}"),
            added_at_ms: ADDED_AT_MS,
            page_count: 1,
            details: BookDetails::default(),
            file: BookFile {
                root,
                location: PathBuf::from(location),
                size_bytes: u64::from(number),
                modified_at_ms: MODIFIED_AT_MS,
            },
            numbering: None,
            name_language: None,
        };
        let recorded = BookId::local(&scanned.fingerprint);
        self.store
            .database()
            .write(move |transaction| record_scanned_books(transaction, &[scanned]))
            .await
            .unwrap();
        recorded
    }

    async fn rescan_without(&self, root: RootId, locations: &[&str]) {
        let locations: Vec<PathBuf> = locations.iter().map(PathBuf::from).collect();
        self.store
            .database()
            .write(move |transaction| {
                let held = remove_book_files(transaction, root, &locations)?;
                remove_books_without_files(transaction, &held)
            })
            .await
            .unwrap();
    }

    async fn remove_from_library(&self, books: &[BookId]) {
        let books = books.to_vec();
        self.store
            .write(move |writer| writer.remove_books_from_library(&books))
            .await
            .unwrap();
    }

    async fn remove_root(&self, root: RootId) {
        self.store
            .database()
            .write(move |transaction| remove_root(transaction, root))
            .await
            .unwrap();
    }

    async fn emptied_place(&self, series: &str) -> Option<EmptiedPlace> {
        let series = SeriesId::local(series).unwrap();
        self.store
            .database()
            .read(move |connection| emptied_series_place(connection, series))
            .await
            .unwrap()
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

#[tokio::test]
async fn remembers_the_folder_of_the_last_file_a_rescan_removes_from_a_series() {
    let library = Library::open("emptied-place-last-file").await;
    library
        .record(
            library.comics,
            EMPTIED,
            "Sample Series 01/Part 1/v01.cbz",
            1,
        )
        .await;
    library
        .record(
            library.comics,
            EMPTIED,
            "Sample Series 01/Part 2/v02.cbz",
            2,
        )
        .await;

    library
        .rescan_without(
            library.comics,
            &[
                "Sample Series 01/Part 1/v01.cbz",
                "Sample Series 01/Part 2/v02.cbz",
            ],
        )
        .await;

    assert_eq!(
        library.emptied_place(EMPTIED).await,
        Some(EmptiedPlace {
            root: library.comics,
            folder: PathBuf::from("Sample Series 01/Part 2"),
        })
    );
}

#[tokio::test]
async fn remembers_no_place_while_the_series_keeps_a_file_in_its_folder() {
    let library = Library::open("emptied-place-file-kept").await;
    library
        .record(library.comics, EMPTIED, "Sample Series 01/v01.cbz", 1)
        .await;
    library
        .record(library.comics, EMPTIED, "Sample Series 01/v02.cbz", 2)
        .await;

    library
        .rescan_without(library.comics, &["Sample Series 01/v01.cbz"])
        .await;

    assert_eq!(library.emptied_place(EMPTIED).await, None);
}

#[tokio::test]
async fn remembers_no_place_while_another_folder_holds_a_book_of_the_series() {
    let library = Library::open("emptied-place-other-folder").await;
    library
        .record(library.comics, EMPTIED, "Sample Series 01/v01.cbz", 1)
        .await;
    library
        .record(library.manga, EMPTIED, "Sample Series 01/v02.cbz", 2)
        .await;

    library
        .rescan_without(library.comics, &["Sample Series 01/v01.cbz"])
        .await;

    assert_eq!(library.emptied_place(EMPTIED).await, None);
}

#[tokio::test]
async fn remembers_no_place_when_the_person_removes_the_series_books_from_the_library() {
    let library = Library::open("emptied-place-removed-by-person").await;
    let only = library
        .record(library.comics, EMPTIED, "Sample Series 01/v01.cbz", 1)
        .await;

    library.remove_from_library(&[only]).await;

    assert_eq!(library.emptied_place(EMPTIED).await, None);
}

#[tokio::test]
async fn forgets_the_place_when_its_folder_leaves_the_library() {
    let library = Library::open("emptied-place-root-removed").await;
    library
        .record(library.comics, EMPTIED, "Sample Series 01/v01.cbz", 1)
        .await;
    library
        .rescan_without(library.comics, &["Sample Series 01/v01.cbz"])
        .await;

    library.remove_root(library.comics).await;

    assert_eq!(library.emptied_place(EMPTIED).await, None);
}

#[tokio::test]
async fn forgets_the_place_when_a_book_is_filed_into_the_series_again() {
    let library = Library::open("emptied-place-refilled").await;
    library
        .record(library.comics, EMPTIED, "Sample Series 01/v01.cbz", 1)
        .await;
    library
        .rescan_without(library.comics, &["Sample Series 01/v01.cbz"])
        .await;

    library
        .record(library.comics, EMPTIED, "Sample Series 01/v02.cbz", 2)
        .await;

    assert_eq!(library.emptied_place(EMPTIED).await, None);
}

#[tokio::test]
async fn forgets_the_place_when_a_book_with_a_file_moves_into_the_series() {
    let library = Library::open("emptied-place-book-moved-in").await;
    library
        .record(library.comics, EMPTIED, "Sample Series 01/v01.cbz", 1)
        .await;
    library
        .record(library.manga, OTHER, "Loose/v02.cbz", 2)
        .await;
    library
        .rescan_without(library.comics, &["Sample Series 01/v01.cbz"])
        .await;

    library
        .record(library.manga, EMPTIED, "Loose/v02.cbz", 2)
        .await;

    assert_eq!(library.emptied_place(EMPTIED).await, None);
}

#[tokio::test]
async fn forgets_the_place_when_a_known_file_now_holds_a_book_of_the_series() {
    let library = Library::open("emptied-place-file-changed").await;
    library
        .record(library.comics, EMPTIED, "Sample Series 01/v01.cbz", 1)
        .await;
    library
        .record(library.manga, OTHER, "Loose/v02.cbz", 2)
        .await;
    library
        .rescan_without(library.comics, &["Sample Series 01/v01.cbz"])
        .await;

    library
        .record(library.manga, EMPTIED, "Loose/v02.cbz", 3)
        .await;

    assert_eq!(library.emptied_place(EMPTIED).await, None);
}
