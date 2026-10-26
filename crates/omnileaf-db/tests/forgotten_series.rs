#![expect(
    clippy::unwrap_used,
    reason = "each test builds its own scratch library, so a failed set-up should stop the test"
)]

mod library_seed;
#[expect(
    dead_code,
    reason = "these tests take only the store's clock, never its reading helpers"
)]
mod store_support;
mod support;

use library_seed::{SeriesSeed, fingerprint, seed_library};
use omnileaf_db::{
    catalog::{
        Inclusion, PageRequest, PageSize, SearchText, SeriesFilter, SeriesListing, SeriesOrder,
        SeriesSearch, SeriesSort, search_count, search_page, series_count, series_page,
    },
    store::{Continuity, SessionPlace, Store},
};
use omnileaf_sync_proto::BookId;
use store_support::{FakeClock, NOW_UNIX_MS, open_store};
use support::ScratchFolder;

const MINUTE_MS: u64 = 60_000;
const PAGE_COUNT: u32 = 24;
const WHOLE_SHELF: u16 = 10;
const UTC: i16 = 0;
const READ_FIRST: &str = "Sample Series 01";
const READ_LATER: &str = "Sample Series 02";
const NEVER_READ: &str = "Sample Series 03";
const BETWEEN_THE_TWO_MINUTES: u64 = 5;
const READ_LATER_MINUTES: u64 = 10;

struct Shelf {
    store: Store,
    clock: FakeClock,
    _folder: ScratchFolder,
}

impl Shelf {
    async fn read_once_each(name: &str) -> Self {
        let folder = ScratchFolder::new(name);
        let clock = FakeClock::at(NOW_UNIX_MS);
        let store = open_store(&folder, clock.clone());
        let seeds = [READ_FIRST, READ_LATER, NEVER_READ].map(SeriesSeed::named);
        seed_library(store.database(), &seeds).await;
        let shelf = Self {
            store,
            clock,
            _folder: folder,
        };
        shelf.read(READ_FIRST, 0).await;
        shelf.read(READ_LATER, READ_LATER_MINUTES).await;
        shelf
    }

    async fn read(&self, series: &str, minutes_later: u64) {
        self.clock.set(NOW_UNIX_MS + minutes_later * MINUTE_MS);
        let place = SessionPlace {
            book: book_of(series),
            page: 1,
            page_count: PAGE_COUNT,
            utc_offset_minutes: UTC,
        };
        self.store
            .write(move |writer| writer.record_reading(&place, Continuity::AfterBreak))
            .await
            .unwrap();
    }

    async fn finish(&self, series: &str) {
        let book = book_of(series);
        self.store
            .write(move |writer| writer.set_read(book, true))
            .await
            .unwrap();
    }

    async fn titles(&self, filter: SeriesFilter) -> Vec<String> {
        let listing = SeriesListing {
            sort: SeriesSort::ascending(SeriesOrder::Title),
            filter,
        };
        let page = self
            .store
            .database()
            .read(move |connection| series_page(connection, &listing, &whole_shelf()))
            .await
            .unwrap();
        page.items.into_iter().map(|series| series.title).collect()
    }

    async fn count(&self, filter: SeriesFilter) -> u32 {
        self.store
            .database()
            .read(move |connection| series_count(connection, &filter))
            .await
            .unwrap()
    }

    async fn found(&self, filter: SeriesFilter) -> (Vec<String>, u32) {
        let search = SeriesSearch {
            text: SearchText::parse("Sample Series").unwrap().unwrap(),
            filter,
        };
        self.store
            .database()
            .read(move |connection| {
                let page = search_page(connection, &search, &whole_shelf())?;
                let titles = page.items.into_iter().map(|series| series.title).collect();
                Ok((titles, search_count(connection, &search)?))
            })
            .await
            .unwrap()
    }
}

fn book_of(series: &str) -> BookId {
    BookId::local(&fingerprint(series, "Volume 01"))
}

fn whole_shelf() -> PageRequest {
    PageRequest {
        after: None,
        size: PageSize::try_from(WHOLE_SHELF).unwrap(),
    }
}

const fn last_read_before(minutes_later: u64) -> SeriesFilter {
    SeriesFilter {
        last_read_before_ms: Some((NOW_UNIX_MS + minutes_later * MINUTE_MS).cast_signed()),
        ..SeriesFilter::NONE
    }
}

#[tokio::test]
async fn lists_only_the_series_read_and_last_read_before_the_instant() {
    let shelf = Shelf::read_once_each("forgotten-list").await;

    let titles = shelf
        .titles(last_read_before(BETWEEN_THE_TWO_MINUTES))
        .await;

    assert_eq!(titles, [READ_FIRST]);
}

#[tokio::test]
async fn counts_only_the_series_read_and_last_read_before_the_instant() {
    let shelf = Shelf::read_once_each("forgotten-count").await;

    let count = shelf.count(last_read_before(BETWEEN_THE_TWO_MINUTES)).await;

    assert_eq!(count, 1);
}

#[tokio::test]
async fn leaves_out_a_series_read_again_since_the_instant() {
    let shelf = Shelf::read_once_each("forgotten-read-again").await;
    shelf.read(READ_FIRST, READ_LATER_MINUTES).await;

    let titles = shelf
        .titles(last_read_before(BETWEEN_THE_TWO_MINUTES))
        .await;

    assert_eq!(titles, Vec::<String>::new());
}

#[tokio::test]
async fn finds_and_counts_only_the_series_last_read_before_the_instant() {
    let shelf = Shelf::read_once_each("forgotten-search").await;

    let found = shelf.found(last_read_before(BETWEEN_THE_TWO_MINUTES)).await;

    assert_eq!(found, (vec![READ_FIRST.to_owned()], 1));
}

#[tokio::test]
async fn combines_with_a_reading_stage_filter() {
    let shelf = Shelf::read_once_each("forgotten-and-unfinished").await;
    shelf.finish(READ_FIRST).await;
    let filter = SeriesFilter {
        finished: Inclusion::Hide,
        ..last_read_before(READ_LATER_MINUTES + 1)
    };

    let titles = shelf.titles(filter).await;

    assert_eq!(titles, [READ_LATER]);
}
