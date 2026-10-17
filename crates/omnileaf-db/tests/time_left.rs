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
        Cursor, Page, PageRequest, PageSize, SeriesListing, SeriesOrder, SeriesSort,
        record_page_count, remove_books_without_files, series_overview, series_page,
    },
    store::{Clock, Store, Writer},
};
use omnileaf_sync_proto::{BookId, SeriesId};
use support::{ScratchFolder, library_config};

const LONG: &str = "Sample Series 01";
const SHORT: &str = "Sample Series 02";
const UNCOUNTED: &str = "Sample Series 03";
const ONE_BOOK: &[&str] = &["Volume 01"];
const TWO_BOOKS: &[&str] = &["Volume 01", "Volume 02"];
const SHORTEST_FIRST: SeriesListing =
    SeriesListing::unfiltered(SeriesSort::ascending(SeriesOrder::TimeLeft));
const LONGEST_FIRST: SeriesListing =
    SeriesListing::unfiltered(SeriesSort::descending(SeriesOrder::TimeLeft));
const PAGES_LEFT_BY_BOOKS: &str = "SELECT series.title,
        coalesce(sum(CASE
            WHEN book_state.is_read IS 1 OR book.page_count IS NULL THEN 0
            ELSE max(book.page_count
                - coalesce(book_state.position_page, book_state.furthest_page, 0), 0)
        END), 0),
        coalesce(sum(book_state.is_read IS NOT 1 AND book.page_count IS NULL), 0)
    FROM series
    LEFT JOIN book ON book.series_local_id = series.local_id
    LEFT JOIN book_state ON book_state.book_id = book.id
    GROUP BY series.local_id
    ORDER BY series.title";
const PAGES_LEFT_KEPT: &str =
    "SELECT title, pages_left, uncounted_books FROM series ORDER BY title";

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
        let seeds = [(LONG, ONE_BOOK), (SHORT, TWO_BOOKS), (UNCOUNTED, ONE_BOOK)].map(
            |(name, book_titles)| SeriesSeed {
                book_titles,
                ..SeriesSeed::named(name)
            },
        );
        seed_library(store.database(), &seeds).await;
        let shelf = Self {
            store,
            _folder: folder,
        };
        shelf.count_pages(LONG, "Volume 01", 100).await;
        shelf.count_pages(SHORT, "Volume 01", 30).await;
        shelf.count_pages(SHORT, "Volume 02", 40).await;
        shelf
    }

    async fn count_pages(&self, series: &str, volume: &str, page_count: u32) {
        let book = book(series, volume);
        self.store
            .database()
            .write(move |transaction| record_page_count(transaction, book, page_count))
            .await
            .unwrap();
    }

    async fn write(
        &self,
        change: impl FnOnce(&mut Writer<'_>) -> Result<(), omnileaf_db::Error> + Send + 'static,
    ) {
        self.store.write(change).await.unwrap();
    }

    async fn walk(&self, listing: SeriesListing) -> Vec<Vec<String>> {
        let mut pages = Vec::new();
        let mut after = None;
        loop {
            let page = self.page(listing, after).await;
            pages.push(page.items);
            let Some(next) = page.next else {
                self.assert_pages_left_match_the_books().await;
                return pages;
            };
            after = Some(next.to_string().parse().unwrap());
        }
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

    async fn pages_left(&self, series: &str) -> Option<u32> {
        let series = SeriesId::local(series).unwrap();
        self.store
            .database()
            .read(move |connection| series_overview(connection, series))
            .await
            .unwrap()
            .unwrap()
            .pages_left
    }

    async fn assert_pages_left_match_the_books(&self) {
        let [counted, kept] = [PAGES_LEFT_BY_BOOKS, PAGES_LEFT_KEPT].map(|sql| async move {
            self.store
                .database()
                .read(move |connection| {
                    Ok(connection
                        .prepare(sql)?
                        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?
                        .collect::<Result<Vec<(String, i64, i64)>, _>>()?)
                })
                .await
                .unwrap()
        });
        assert_eq!(kept.await, counted.await);
    }
}

fn book(series: &str, volume: &str) -> BookId {
    BookId::local(&fingerprint(series, volume))
}

#[tokio::test]
async fn pages_the_series_with_the_fewest_pages_left_first_and_those_not_counted_last() {
    let shelf = Shelf::open("time-left-shortest-first").await;

    let pages = shelf.walk(SHORTEST_FIRST).await;

    assert_eq!(pages, [vec![SHORT, LONG], vec![UNCOUNTED]]);
}

#[tokio::test]
async fn pages_the_series_with_the_most_pages_left_first_the_other_way_round() {
    let shelf = Shelf::open("time-left-longest-first").await;

    let pages = shelf.walk(LONGEST_FIRST).await;

    assert_eq!(pages, [vec![UNCOUNTED, LONG], vec![SHORT]]);
}

#[tokio::test]
async fn takes_off_the_pages_already_read_in_a_started_book() {
    let shelf = Shelf::open("time-left-started").await;

    shelf
        .write(|writer| writer.set_position(book(LONG, "Volume 01"), 80))
        .await;

    assert_eq!(shelf.pages_left(LONG).await, Some(20));
    assert_eq!(
        shelf.walk(SHORTEST_FIRST).await,
        [vec![LONG, SHORT], vec![UNCOUNTED]]
    );
}

#[tokio::test]
async fn counts_from_the_furthest_page_when_no_position_is_kept() {
    let shelf = Shelf::open("time-left-furthest").await;

    shelf
        .write(|writer| writer.raise_furthest(book(LONG, "Volume 01"), 90))
        .await;

    assert_eq!(shelf.pages_left(LONG).await, Some(10));
    shelf.assert_pages_left_match_the_books().await;
}

#[tokio::test]
async fn leaves_out_the_books_marked_read_and_counts_them_again_once_unread() {
    let shelf = Shelf::open("time-left-read").await;

    shelf
        .write(|writer| writer.set_read(book(SHORT, "Volume 02"), true))
        .await;
    let marked_read = shelf.pages_left(SHORT).await;
    shelf
        .write(|writer| writer.set_read(book(SHORT, "Volume 02"), false))
        .await;

    assert_eq!(
        (marked_read, shelf.pages_left(SHORT).await),
        (Some(30), Some(70))
    );
    shelf.assert_pages_left_match_the_books().await;
}

#[tokio::test]
async fn knows_how_long_a_series_is_once_its_last_book_is_counted() {
    let shelf = Shelf::open("time-left-counted").await;
    let before = shelf.pages_left(UNCOUNTED).await;

    shelf.count_pages(UNCOUNTED, "Volume 01", 10).await;

    assert_eq!(
        (before, shelf.pages_left(UNCOUNTED).await),
        (None, Some(10))
    );
    assert_eq!(
        shelf.walk(SHORTEST_FIRST).await,
        [vec![UNCOUNTED, SHORT], vec![LONG]]
    );
}

#[tokio::test]
async fn counts_a_series_without_the_pages_of_a_book_it_no_longer_holds() {
    let shelf = Shelf::open("time-left-removed").await;
    let removed = book(SHORT, "Volume 02");

    shelf
        .store
        .database()
        .write(move |transaction| remove_books_without_files(transaction, &[removed]))
        .await
        .unwrap();

    assert_eq!(shelf.pages_left(SHORT).await, Some(30));
    shelf.assert_pages_left_match_the_books().await;
}

#[tokio::test]
async fn carries_a_book_s_pages_left_to_the_series_it_moves_to() {
    let shelf = Shelf::open("time-left-moved").await;
    let moved = book(SHORT, "Volume 02");
    let to = SeriesId::local(LONG).unwrap();

    shelf
        .store
        .database()
        .write(move |transaction| {
            transaction.execute(
                "UPDATE book SET series_local_id = (SELECT local_id FROM series WHERE id = ?2)
                 WHERE id = ?1",
                (moved.as_bytes(), to.as_bytes()),
            )?;
            Ok(())
        })
        .await
        .unwrap();

    assert_eq!(
        (shelf.pages_left(SHORT).await, shelf.pages_left(LONG).await),
        (Some(30), Some(140))
    );
    shelf.assert_pages_left_match_the_books().await;
}
