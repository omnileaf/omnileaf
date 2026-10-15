#![expect(
    clippy::unwrap_used,
    reason = "each test builds its own scratch library, so a failed set-up should stop the test"
)]

mod support;

use std::path::PathBuf;

use omnileaf_db::{
    Database,
    catalog::{
        BookFile, Cursor, NewRoot, NewSeries, PageRequest, PageSize, RootId, RootKind, RootLocator,
        ScannedBook, SeriesFilter, SeriesListing, SeriesOrder, SeriesSort, add_root,
        folder_series_count, folder_series_page, record_scanned_books,
    },
};
use omnileaf_sync_proto::{Fingerprint, ImageEntry};
use support::{ScratchFolder, library_config};

const MODIFIED_AT_MS: i64 = 1_780_000_000_000;
const A_TO_Z: SeriesListing = SeriesListing::unfiltered(SeriesSort::ascending(SeriesOrder::Title));
const NEWEST_FIRST: SeriesListing =
    SeriesListing::unfiltered(SeriesSort::descending(SeriesOrder::DateAdded));
const PAGE_OF_TEN: u16 = 10;

struct Library {
    database: Database,
    _folder: ScratchFolder,
    next_crc: u32,
}

impl Library {
    fn open(name: &str) -> Self {
        let folder = ScratchFolder::new(name);
        Self {
            database: Database::open(&library_config(&folder)).unwrap(),
            _folder: folder,
            next_crc: 1,
        }
    }

    async fn add_root(&self, path: &str) -> RootId {
        let root = NewRoot {
            kind: RootKind::Linked,
            locator: RootLocator::Path(PathBuf::from(path)),
            added_at_ms: MODIFIED_AT_MS,
        };
        self.database
            .write(move |transaction| add_root(transaction, &root))
            .await
            .unwrap()
    }

    async fn add_book(&mut self, root: RootId, series: &str, added_at_ms: i64) {
        let crc = self.next_crc;
        self.next_crc += 1;
        let scanned = ScannedBook {
            series: NewSeries::local(series, added_at_ms).unwrap(),
            fingerprint: fingerprint(crc),
            title: format!("Volume {crc:02}"),
            added_at_ms,
            file: BookFile {
                root,
                location: PathBuf::from(format!("{series}/Volume {crc:02}.cbz")),
                size_bytes: u64::from(crc) * 100,
                modified_at_ms: MODIFIED_AT_MS,
            },
        };
        self.database
            .write(move |transaction| record_scanned_books(transaction, &[scanned]))
            .await
            .unwrap();
    }

    async fn titles(
        &self,
        root: RootId,
        listing: SeriesListing,
        after: Option<Cursor>,
        size: u16,
    ) -> (Vec<String>, Option<Cursor>) {
        let request = PageRequest {
            after,
            size: PageSize::try_from(size).unwrap(),
        };
        let page = self
            .database
            .read(move |connection| folder_series_page(connection, root, &listing, &request))
            .await
            .unwrap();
        let titles = page.items.into_iter().map(|series| series.title).collect();
        (titles, page.next)
    }

    async fn count(&self, root: RootId) -> u32 {
        let filter = SeriesFilter::NONE;
        self.database
            .read(move |connection| folder_series_count(connection, root, &filter))
            .await
            .unwrap()
    }
}

fn fingerprint(crc32: u32) -> Fingerprint {
    Fingerprint::pmf1([ImageEntry { crc32, size: 100 }]).unwrap()
}

async fn comics_and_manga() -> (Library, RootId, RootId) {
    let mut library = Library::open("folder-series");
    let comics = library.add_root("/media/Comics").await;
    let manga = library.add_root("/media/Manga").await;
    library.add_book(comics, "Sample Series 02", 2).await;
    library.add_book(manga, "Sample Series 01", 1).await;
    library.add_book(comics, "Sample Series 03", 3).await;
    library.add_book(manga, "Sample Series 03", 3).await;
    (library, comics, manga)
}

#[tokio::test]
async fn lists_only_the_series_with_a_book_in_the_folder() {
    let (library, comics, manga) = comics_and_manga().await;

    let in_comics = library.titles(comics, A_TO_Z, None, PAGE_OF_TEN).await.0;
    let in_manga = library.titles(manga, A_TO_Z, None, PAGE_OF_TEN).await.0;

    assert_eq!(
        (in_comics, in_manga),
        (
            vec!["Sample Series 02".to_owned(), "Sample Series 03".to_owned()],
            vec!["Sample Series 01".to_owned(), "Sample Series 03".to_owned()],
        )
    );
}

#[tokio::test]
async fn lists_a_folder_newest_first() {
    let (library, comics, _) = comics_and_manga().await;

    let titles = library
        .titles(comics, NEWEST_FIRST, None, PAGE_OF_TEN)
        .await
        .0;

    assert_eq!(titles, ["Sample Series 03", "Sample Series 02"]);
}

#[tokio::test]
async fn pages_through_a_folder_with_a_cursor() {
    let (library, _, manga) = comics_and_manga().await;

    let (first, next) = library.titles(manga, A_TO_Z, None, 1).await;
    let (second, last) = library.titles(manga, A_TO_Z, next, 1).await;

    assert_eq!(
        (first, second, last),
        (
            vec!["Sample Series 01".to_owned()],
            vec!["Sample Series 03".to_owned()],
            None
        )
    );
}

#[tokio::test]
async fn counts_the_series_with_a_book_in_the_folder() {
    let (library, comics, manga) = comics_and_manga().await;

    assert_eq!(
        (library.count(comics).await, library.count(manga).await),
        (2, 2)
    );
}

#[tokio::test]
async fn lists_nothing_in_a_folder_without_books() {
    let (library, _, _) = comics_and_manga().await;
    let empty = library.add_root("/media/Books").await;

    let titles = library.titles(empty, A_TO_Z, None, PAGE_OF_TEN).await.0;

    assert_eq!(
        (titles, library.count(empty).await),
        (Vec::<String>::new(), 0)
    );
}
