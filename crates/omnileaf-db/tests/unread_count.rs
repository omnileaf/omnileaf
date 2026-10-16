#![expect(
    clippy::unwrap_used,
    reason = "each test builds its own scratch library, so a failed set-up should stop the test"
)]

mod library_seed;
mod support;

use library_seed::{SeriesSeed, fingerprint, seed_library};
use omnileaf_db::{
    Database,
    catalog::{
        Cursor, Page, PageRequest, PageSize, SeriesListing, SeriesOrder, SeriesSort, series_page,
    },
    store::{Clock, Store},
};
use omnileaf_sync_proto::BookId;
use support::{ScratchFolder, library_config};

const ONE_BOOK: &str = "Sample Series 01";
const THREE_BOOKS: &str = "Sample Series 02";
const TWO_BOOKS: &str = "Sample Series 03";
const VOLUMES: &[&str] = &["Volume 01", "Volume 02", "Volume 03"];
const MOST_UNREAD_FIRST: SeriesListing =
    SeriesListing::unfiltered(SeriesSort::descending(SeriesOrder::UnreadCount));
const FEWEST_UNREAD_FIRST: SeriesListing =
    SeriesListing::unfiltered(SeriesSort::ascending(SeriesOrder::UnreadCount));

struct StoppedClock;

impl Clock for StoppedClock {
    fn now_unix_ms(&self) -> u64 {
        0
    }
}

struct Shelf {
    store: Store,
    _folder: ScratchFolder,
}

impl Shelf {
    async fn open(name: &str) -> Self {
        let folder = ScratchFolder::new(name);
        let store = Store::new(
            Database::open(&library_config(&folder)).unwrap(),
            StoppedClock,
        );
        let seeds =
            [(ONE_BOOK, 1), (THREE_BOOKS, 3), (TWO_BOOKS, 2)].map(|(name, books)| SeriesSeed {
                book_titles: VOLUMES.get(..books).unwrap(),
                ..SeriesSeed::named(name)
            });
        seed_library(store.database(), &seeds).await;
        Self {
            store,
            _folder: folder,
        }
    }

    async fn mark_read(&self, series: &str, volumes: &'static [&'static str], is_read: bool) {
        let books: Vec<BookId> = volumes
            .iter()
            .map(|volume| BookId::local(&fingerprint(series, volume)))
            .collect();
        self.store
            .write(move |writer| {
                books
                    .iter()
                    .try_for_each(|&book| writer.set_read(book, is_read))
            })
            .await
            .unwrap();
    }

    async fn page(&self, listing: SeriesListing, after: Option<Cursor>) -> Page<String> {
        let request = PageRequest {
            after,
            size: PageSize::try_from(2).unwrap(),
        };
        let page = self
            .store
            .database()
            .read(move |connection| series_page(connection, &listing, &request))
            .await
            .unwrap();
        Page {
            items: page.items.into_iter().map(|series| series.title).collect(),
            next: page.next,
        }
    }

    async fn walk(&self, listing: SeriesListing) -> Vec<Vec<String>> {
        let mut pages = Vec::new();
        let mut after = None;
        loop {
            let page = self.page(listing, after).await;
            pages.push(page.items);
            let Some(next) = page.next else {
                return pages;
            };
            after = Some(next.to_string().parse().unwrap());
        }
    }
}

#[tokio::test]
async fn pages_the_series_with_the_most_books_left_unread_first() {
    let shelf = Shelf::open("most-unread-first").await;

    let pages = shelf.walk(MOST_UNREAD_FIRST).await;

    assert_eq!(pages, [vec![THREE_BOOKS, TWO_BOOKS], vec![ONE_BOOK]]);
}

#[tokio::test]
async fn pages_the_series_with_the_fewest_books_left_unread_first_the_other_way_round() {
    let shelf = Shelf::open("fewest-unread-first").await;

    let pages = shelf.walk(FEWEST_UNREAD_FIRST).await;

    assert_eq!(pages, [vec![ONE_BOOK, TWO_BOOKS], vec![THREE_BOOKS]]);
}

#[tokio::test]
async fn moves_a_series_down_as_its_books_are_marked_read() {
    let shelf = Shelf::open("unread-marked-read").await;

    shelf.mark_read(THREE_BOOKS, VOLUMES, true).await;

    let pages = shelf.walk(MOST_UNREAD_FIRST).await;
    assert_eq!(pages, [vec![TWO_BOOKS, ONE_BOOK], vec![THREE_BOOKS]]);
}

#[tokio::test]
async fn moves_a_series_back_up_once_its_books_are_marked_unread_again() {
    let shelf = Shelf::open("unread-marked-unread").await;
    shelf.mark_read(THREE_BOOKS, VOLUMES, true).await;

    shelf.mark_read(THREE_BOOKS, VOLUMES, false).await;

    let pages = shelf.walk(MOST_UNREAD_FIRST).await;
    assert_eq!(pages, [vec![THREE_BOOKS, TWO_BOOKS], vec![ONE_BOOK]]);
}
