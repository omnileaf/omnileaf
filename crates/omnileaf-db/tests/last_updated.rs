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
        Cursor, NewBook, Page, PageRequest, PageSize, SeriesListing, SeriesOrder, SeriesSort,
        add_book, remove_books_without_files, series_page,
    },
};
use omnileaf_sync_proto::{BookId, SeriesId};
use support::{ScratchFolder, library_config};

const FIRST: &str = "Sample Series 01";
const SECOND: &str = "Sample Series 02";
const THIRD: &str = "Sample Series 03";
const NEW_VOLUME: &str = "Volume 02";
const UPDATED_LAST_FIRST: SeriesListing =
    SeriesListing::unfiltered(SeriesSort::descending(SeriesOrder::LastUpdated));
const UPDATED_LONGEST_AGO_FIRST: SeriesListing =
    SeriesListing::unfiltered(SeriesSort::ascending(SeriesOrder::LastUpdated));

struct Shelf {
    database: Database,
    _folder: ScratchFolder,
}

impl Shelf {
    async fn open(name: &str) -> Self {
        let folder = ScratchFolder::new(name);
        let database = Database::open(&library_config(&folder)).unwrap();
        let seeds = [(FIRST, 1), (SECOND, 2), (THIRD, 3)].map(|(name, added_at_ms)| SeriesSeed {
            added_at_ms,
            ..SeriesSeed::named(name)
        });
        seed_library(&database, &seeds).await;
        Self {
            database,
            _folder: folder,
        }
    }

    async fn add_volume(&self, series: &str, added_at_ms: i64) {
        let book = NewBook {
            fingerprint: fingerprint(series, NEW_VOLUME),
            series: SeriesId::local(series).unwrap(),
            title: NEW_VOLUME.to_owned(),
            added_at_ms,
            page_count: None,
            numbering: None,
        };
        self.database
            .write(move |transaction| add_book(transaction, &book))
            .await
            .unwrap();
    }

    async fn remove_volume(&self, series: &str) {
        let book = new_volume_of(series);
        self.database
            .write(move |transaction| remove_books_without_files(transaction, &[book]))
            .await
            .unwrap();
    }

    async fn move_volume(&self, from: &str, to: &str) {
        let book = new_volume_of(from);
        let to = SeriesId::local(to).unwrap();
        self.database
            .write(move |transaction| {
                transaction.execute(
                    "UPDATE book SET series_local_id = (SELECT local_id FROM series WHERE id = ?2)
                     WHERE id = ?1",
                    (book.as_bytes(), to.as_bytes()),
                )?;
                Ok(())
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
            .database
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

fn new_volume_of(series: &str) -> BookId {
    BookId::local(&fingerprint(series, NEW_VOLUME))
}

#[tokio::test]
async fn pages_the_series_that_gained_a_book_last_first() {
    let shelf = Shelf::open("updated-last-first").await;
    shelf.add_volume(FIRST, 10).await;

    let pages = shelf.walk(UPDATED_LAST_FIRST).await;

    assert_eq!(pages, [vec![FIRST, THIRD], vec![SECOND]]);
}

#[tokio::test]
async fn pages_the_series_updated_longest_ago_first_the_other_way_round() {
    let shelf = Shelf::open("updated-longest-ago-first").await;
    shelf.add_volume(FIRST, 10).await;

    let pages = shelf.walk(UPDATED_LONGEST_AGO_FIRST).await;

    assert_eq!(pages, [vec![SECOND, THIRD], vec![FIRST]]);
}

#[tokio::test]
async fn moves_a_series_back_once_the_book_it_gained_last_is_removed() {
    let shelf = Shelf::open("updated-book-removed").await;
    shelf.add_volume(FIRST, 10).await;

    shelf.remove_volume(FIRST).await;

    let pages = shelf.walk(UPDATED_LAST_FIRST).await;
    assert_eq!(pages, [vec![THIRD, SECOND], vec![FIRST]]);
}

#[tokio::test]
async fn carries_a_book_s_date_over_when_it_moves_to_another_series() {
    let shelf = Shelf::open("updated-book-moved").await;
    shelf.add_volume(FIRST, 10).await;

    shelf.move_volume(FIRST, SECOND).await;

    let pages = shelf.walk(UPDATED_LAST_FIRST).await;
    assert_eq!(pages, [vec![SECOND, THIRD], vec![FIRST]]);
}
