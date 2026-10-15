#![expect(
    clippy::unwrap_used,
    reason = "each test builds its own scratch library, so a failed set-up should stop the test"
)]

mod library_seed;
#[expect(
    dead_code,
    reason = "these tests record reading sessions but never write a book's reading state"
)]
mod store_support;
mod support;

use library_seed::{SeriesSeed, fingerprint, seed_library};
use omnileaf_db::{
    catalog::{
        Cursor, Page, PageRequest, PageSize, SeriesListing, SeriesOrder, SeriesSort, series_page,
    },
    store::{Continuity, SessionPlace, Store},
};
use omnileaf_sync_proto::BookId;
use store_support::{FakeClock, NOW_UNIX_MS, open_store};
use support::ScratchFolder;

const MINUTE_MS: u64 = 60_000;
const PAGE_COUNT: u32 = 24;
const UTC: i16 = 0;
const FIRST: &str = "Sample Series 01";
const SECOND: &str = "Sample Series 02";
const NEVER_READ: &str = "Sample Series 03";
const READ_LAST_FIRST: SeriesListing =
    SeriesListing::unfiltered(SeriesSort::descending(SeriesOrder::LastRead));
const READ_LONGEST_AGO_FIRST: SeriesListing =
    SeriesListing::unfiltered(SeriesSort::ascending(SeriesOrder::LastRead));

struct Shelf {
    store: Store,
    clock: FakeClock,
    _folder: ScratchFolder,
}

impl Shelf {
    async fn open(name: &str) -> Self {
        let folder = ScratchFolder::new(name);
        let clock = FakeClock::at(NOW_UNIX_MS);
        let store = open_store(&folder, clock.clone());
        let seeds = [FIRST, SECOND, NEVER_READ].map(SeriesSeed::named);
        seed_library(store.database(), &seeds).await;
        Self {
            store,
            clock,
            _folder: folder,
        }
    }

    async fn read(&self, series: &str, minutes_later: u64, continuity: Continuity) {
        self.clock.set(NOW_UNIX_MS + minutes_later * MINUTE_MS);
        let place = SessionPlace {
            book: first_book_of(series),
            page: 1,
            page_count: PAGE_COUNT,
            utc_offset_minutes: UTC,
        };
        self.store
            .write(move |writer| writer.record_reading(&place, continuity))
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

fn first_book_of(series: &str) -> BookId {
    BookId::local(&fingerprint(series, "Volume 01"))
}

#[tokio::test]
async fn pages_the_series_read_last_first_and_those_never_read_after_them() {
    let shelf = Shelf::open("read-last-first").await;
    shelf.read(SECOND, 1, Continuity::AfterBreak).await;
    shelf.read(FIRST, 5, Continuity::AfterBreak).await;

    let pages = shelf.walk(READ_LAST_FIRST).await;

    assert_eq!(pages, [vec![FIRST, SECOND], vec![NEVER_READ]]);
}

#[tokio::test]
async fn pages_the_series_read_longest_ago_first_the_other_way_round() {
    let shelf = Shelf::open("read-longest-ago-first").await;
    shelf.read(SECOND, 1, Continuity::AfterBreak).await;
    shelf.read(FIRST, 5, Continuity::AfterBreak).await;

    let pages = shelf.walk(READ_LONGEST_AGO_FIRST).await;

    assert_eq!(pages, [vec![NEVER_READ, SECOND], vec![FIRST]]);
}

#[tokio::test]
async fn moves_a_series_up_while_its_reading_carries_on() {
    let shelf = Shelf::open("read-carries-on").await;
    shelf.read(FIRST, 1, Continuity::AfterBreak).await;
    shelf.read(SECOND, 2, Continuity::AfterBreak).await;
    shelf.read(FIRST, 3, Continuity::AfterBreak).await;
    shelf.read(FIRST, 30, Continuity::Unbroken).await;

    let pages = shelf.walk(READ_LAST_FIRST).await;

    assert_eq!(pages, [vec![FIRST, SECOND], vec![NEVER_READ]]);
}
