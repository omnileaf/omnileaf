#![expect(
    clippy::unwrap_used,
    reason = "each test builds its own scratch library, so a failed set-up should stop the test"
)]

mod support;

use std::path::PathBuf;

use omnileaf_db::{
    Database,
    catalog::{
        BookFile, NewRoot, NewSeries, PageRequest, PageSize, RootId, RootKind, RootLocator,
        ScannedBook, SeriesListing, SeriesOrder, SeriesSort, add_root, hidden_series_count,
        library_root, mark_root_available, mark_root_unavailable, record_scanned_books,
        series_count, series_page, show_root_while_missing,
    },
};
use omnileaf_sync_proto::{Fingerprint, ImageEntry};
use support::{ScratchFolder, library_config};

const ADDED_AT_MS: i64 = 1_780_000_000_000;
const MISSING_SINCE_MS: i64 = 1_790_000_000_000;
const A_TO_Z: SeriesListing = SeriesListing::unfiltered(SeriesSort::ascending(SeriesOrder::Title));

struct Shelf {
    database: Database,
    comics: RootId,
    manga: RootId,
    _folder: ScratchFolder,
}

impl Shelf {
    async fn open(name: &str) -> Self {
        let folder = ScratchFolder::new(name);
        let database = Database::open(&library_config(&folder)).unwrap();
        let comics = add(&database, "/media/Comics").await;
        let manga = add(&database, "/media/Manga").await;
        let shelf = Self {
            database,
            comics,
            manga,
            _folder: folder,
        };
        shelf.shelve(comics, "Harbour Gate", 1).await;
        shelf.shelve(comics, "Lantern Market", 2).await;
        shelf.shelve(manga, "Lantern Market", 3).await;
        shelf.shelve(manga, "Sea Stories", 4).await;
        shelf
    }

    async fn shelve(&self, root: RootId, series: &str, number: u32) {
        let scanned = ScannedBook {
            series: NewSeries::local(series, ADDED_AT_MS).unwrap(),
            fingerprint: Fingerprint::pmf1([ImageEntry {
                crc32: number,
                size: 1,
            }])
            .unwrap(),
            title: format!("Volume {number:02}"),
            added_at_ms: ADDED_AT_MS,
            file: BookFile {
                root,
                location: format!("{series}/Volume {number:02}.cbz").into(),
                size_bytes: 100,
                modified_at_ms: ADDED_AT_MS,
            },
        };
        self.database
            .write(move |transaction| record_scanned_books(transaction, &[scanned]))
            .await
            .unwrap();
    }

    async fn go_missing(&self, root: RootId) {
        self.database
            .write(move |transaction| mark_root_unavailable(transaction, root, MISSING_SINCE_MS))
            .await
            .unwrap();
    }

    async fn come_back(&self, root: RootId) {
        self.database
            .write(move |transaction| mark_root_available(transaction, root))
            .await
            .unwrap();
    }

    async fn show_anyway(&self, root: RootId, is_shown: bool) {
        self.database
            .write(move |transaction| show_root_while_missing(transaction, root, is_shown))
            .await
            .unwrap();
    }

    async fn listed(&self) -> Vec<String> {
        let request = PageRequest {
            after: None,
            size: PageSize::try_from(50).unwrap(),
        };
        let page = self
            .database
            .read(move |connection| series_page(connection, &A_TO_Z, &request))
            .await
            .unwrap();
        page.items.into_iter().map(|series| series.title).collect()
    }

    async fn hidden(&self, root: Option<RootId>) -> u32 {
        self.database
            .read(move |connection| hidden_series_count(connection, root))
            .await
            .unwrap()
    }
}

async fn add(database: &Database, path: &str) -> RootId {
    let root = NewRoot {
        kind: RootKind::Linked,
        locator: RootLocator::Path(PathBuf::from(path)),
        added_at_ms: ADDED_AT_MS,
    };
    database
        .write(move |transaction| add_root(transaction, &root))
        .await
        .unwrap()
}

#[tokio::test]
async fn hides_each_series_whose_every_book_is_in_a_missing_folder() {
    let shelf = Shelf::open("missing-hides").await;

    shelf.go_missing(shelf.comics).await;

    assert_eq!(shelf.listed().await, ["Lantern Market", "Sea Stories"]);
    let counted = shelf
        .database
        .read(|connection| series_count(connection, &A_TO_Z.filter))
        .await
        .unwrap();
    assert_eq!(counted, 2);
}

#[tokio::test]
async fn counts_the_series_a_missing_folder_hides_and_every_one_hidden() {
    let shelf = Shelf::open("missing-counts").await;

    shelf.go_missing(shelf.comics).await;
    shelf.go_missing(shelf.manga).await;

    assert_eq!(
        [
            shelf.hidden(Some(shelf.comics)).await,
            shelf.hidden(Some(shelf.manga)).await,
            shelf.hidden(None).await,
        ],
        [2, 2, 3]
    );
}

#[tokio::test]
async fn shows_the_series_of_a_missing_folder_once_asked() {
    let shelf = Shelf::open("missing-shown").await;
    shelf.go_missing(shelf.comics).await;

    shelf.show_anyway(shelf.comics, true).await;

    assert_eq!(
        (shelf.listed().await, shelf.hidden(None).await),
        (
            vec![
                "Harbour Gate".to_owned(),
                "Lantern Market".to_owned(),
                "Sea Stories".to_owned()
            ],
            0
        )
    );
    let root = shelf
        .database
        .read({
            let comics = shelf.comics;
            move |connection| library_root(connection, comics)
        })
        .await
        .unwrap();
    assert!(root.shows_while_missing);
}

#[tokio::test]
async fn hides_them_again_when_the_folder_comes_back_and_goes_missing_once_more() {
    let shelf = Shelf::open("missing-again").await;
    shelf.go_missing(shelf.comics).await;
    shelf.show_anyway(shelf.comics, true).await;

    shelf.come_back(shelf.comics).await;
    let back = shelf.listed().await;
    shelf.go_missing(shelf.comics).await;

    assert_eq!(
        (back.len(), shelf.listed().await),
        (
            3,
            vec!["Lantern Market".to_owned(), "Sea Stories".to_owned()]
        )
    );
}
