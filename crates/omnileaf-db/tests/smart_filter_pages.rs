#![expect(
    clippy::unwrap_used,
    reason = "each test builds its own scratch library, so a failed set-up should stop the test"
)]

#[expect(
    dead_code,
    reason = "these tests take only the store's clock and book ids, never its reading helpers"
)]
mod store_support;
mod support;

use std::{collections::BTreeSet, path::PathBuf};

use omnileaf_db::{
    Error,
    catalog::{
        BookDetails, BookFile, Cursor, Inclusion, NewRoot, NewSeries, PageRequest, PageSize,
        RootId, RootKind, RootLocator, ScannedBook, SeriesFilter, SeriesListing, SeriesOrder,
        SeriesSort, SeriesSummary, add_root, record_scanned_books, series_page,
    },
    store::{Continuity, SessionPlace, Store, Writer},
};
use omnileaf_sync_proto::{BookId, Fingerprint, ImageEntry};
use store_support::{FakeClock, NOW_UNIX_MS, book, open_store};
use support::ScratchFolder;

const MINUTE_MS: u64 = 60_000;
const READ_LATELY_MINUTES: u64 = 10;
const FORGOTTEN_BEFORE_MINUTES: u64 = 5;
const PAGE_COUNT: u32 = 24;
const UTC: i16 = 0;
const SHORT_SHELF: u32 = 12;
const LONG_SHELF: u32 = 600;
const MIXED_SHELF: u32 = 60;
const EVERY_SIXTH: u32 = 6;
const EVERY_THIRD_READ_LONG_AGO: u32 = 3;
const EVERY_NINTH_FINISHED: u32 = 9;
const EVERY_FIFTH_READ_LATELY: u32 = 5;
const EVERY_FOURTH_COPIED: u32 = 4;
const PAGE_OF_TWO: u16 = 2;
const PAGE_OF_THREE: u16 = 3;
const PAGE_OF_TWO_HUNDRED: u16 = 200;
const FORGOTTEN: SeriesFilter = SeriesFilter {
    last_read_before_ms: Some((NOW_UNIX_MS + FORGOTTEN_BEFORE_MINUTES * MINUTE_MS).cast_signed()),
    ..SeriesFilter::NONE
};
const DUPLICATED: SeriesFilter = SeriesFilter {
    duplicates: Inclusion::Only,
    ..SeriesFilter::NONE
};
const ORDERS: [SeriesOrder; 6] = [
    SeriesOrder::Title,
    SeriesOrder::DateAdded,
    SeriesOrder::LastRead,
    SeriesOrder::LastUpdated,
    SeriesOrder::UnreadCount,
    SeriesOrder::TimeLeft,
];

struct Shelf {
    store: Store,
    clock: FakeClock,
    backup: RootId,
    _folder: ScratchFolder,
}

impl Shelf {
    async fn holding(name: &str, series_count: u32) -> Self {
        let folder = ScratchFolder::new(name);
        let clock = FakeClock::at(NOW_UNIX_MS);
        let store = open_store(&folder, clock.clone());
        let (comics, backup) = store
            .database()
            .write(|transaction| {
                Ok((
                    add_root(transaction, &linked("/media/Comics"))?,
                    add_root(transaction, &linked("/media/Backup"))?,
                ))
            })
            .await
            .unwrap();
        let shelf = Self {
            store,
            clock,
            backup,
            _folder: folder,
        };
        shelf.scan(comics, 0..series_count).await;
        shelf
    }

    async fn scan(&self, root: RootId, numbers: impl Iterator<Item = u32>) {
        let scanned: Vec<ScannedBook> = numbers.map(|number| scanned(root, number)).collect();
        self.store
            .database()
            .write(move |transaction| record_scanned_books(transaction, &scanned))
            .await
            .unwrap();
    }

    async fn copy_into_backup(&self, numbers: impl Iterator<Item = u32>) {
        self.scan(self.backup, numbers).await;
    }

    async fn read(&self, numbers: impl Iterator<Item = u32>, minutes_later: u64) {
        self.clock.set(NOW_UNIX_MS + minutes_later * MINUTE_MS);
        self.write_each_book(numbers, |writer, book| {
            let place = SessionPlace {
                book,
                page: 1,
                page_count: PAGE_COUNT,
                utc_offset_minutes: UTC,
            };
            writer.record_reading(&place, Continuity::AfterBreak)
        })
        .await;
    }

    async fn start(&self, numbers: impl Iterator<Item = u32>) {
        self.write_each_book(numbers, |writer, book| writer.set_position(book, 1))
            .await;
    }

    async fn finish(&self, numbers: impl Iterator<Item = u32>) {
        self.write_each_book(numbers, |writer, book| writer.set_read(book, true))
            .await;
    }

    async fn write_each_book(
        &self,
        numbers: impl Iterator<Item = u32>,
        write: impl Fn(&mut Writer<'_>, BookId) -> Result<(), Error> + Send + 'static,
    ) {
        let books: Vec<BookId> = numbers.map(book).collect();
        self.store
            .write(move |writer| books.into_iter().try_for_each(|book| write(writer, book)))
            .await
            .unwrap();
    }

    async fn pages(&self, listing: SeriesListing, size: u16) -> Vec<Vec<String>> {
        self.summary_pages(listing, size)
            .await
            .into_iter()
            .map(|page| page.into_iter().map(|series| series.title).collect())
            .collect()
    }

    async fn listed_series(&self, listing: SeriesListing, size: u16) -> Vec<SeriesSummary> {
        self.summary_pages(listing, size)
            .await
            .into_iter()
            .flatten()
            .collect()
    }

    async fn listed_by_each_stage_in_order(
        &self,
        listing: SeriesListing,
        matching: &BTreeSet<String>,
    ) -> Vec<SeriesSummary> {
        let without_smart_conditions = SeriesListing {
            filter: SeriesFilter {
                last_read_before_ms: None,
                duplicates: Inclusion::Any,
                ..listing.filter
            },
            ..listing
        };
        let mut series = self
            .listed_series(without_smart_conditions, PAGE_OF_TWO_HUNDRED)
            .await;
        series.retain(|series| matching.contains(&series.title));
        series
    }

    async fn summary_pages(&self, listing: SeriesListing, size: u16) -> Vec<Vec<SeriesSummary>> {
        let mut pages = Vec::new();
        let mut after: Option<Cursor> = None;
        loop {
            let request = PageRequest {
                after,
                size: PageSize::try_from(size).unwrap(),
            };
            let page = self
                .store
                .database()
                .read(move |connection| series_page(connection, &listing, &request))
                .await
                .unwrap();
            pages.push(page.items);
            let Some(next) = page.next else {
                return pages;
            };
            after = Some(next.to_string().parse().unwrap());
        }
    }
}

fn linked(path: &str) -> NewRoot {
    NewRoot {
        kind: RootKind::Linked,
        locator: RootLocator::Path(PathBuf::from(path)),
        added_at_ms: 0,
    }
}

fn series_name(number: u32) -> String {
    format!("Sample Series {number:03}")
}

fn scanned(root: RootId, number: u32) -> ScannedBook {
    let page = ImageEntry {
        crc32: number,
        size: 1,
    };
    let name = series_name(number);
    ScannedBook {
        series: NewSeries::local(&name, i64::from(number)).unwrap(),
        fingerprint: Fingerprint::pmf1([page]).unwrap(),
        title: "Volume 01".to_owned(),
        added_at_ms: i64::from(number),
        page_count: PAGE_COUNT,
        details: BookDetails::default(),
        file: BookFile {
            root,
            location: PathBuf::from(format!("{name}/Volume 01.cbz")),
            size_bytes: 1,
            modified_at_ms: 0,
        },
    }
}

fn pages_of(numbers: &[u32], size: usize) -> Vec<Vec<String>> {
    numbers
        .chunks(size)
        .map(|page| page.iter().copied().map(series_name).collect())
        .collect()
}

fn multiples_of(step: u32, count: u32) -> impl Iterator<Item = u32> {
    (0..count).filter(move |number| number.is_multiple_of(step))
}

fn titles_of(numbers: impl Iterator<Item = u32>) -> BTreeSet<String> {
    numbers.map(series_name).collect()
}

fn every_sort() -> impl Iterator<Item = SeriesSort> {
    ORDERS
        .into_iter()
        .flat_map(|order| [SeriesSort::ascending(order), SeriesSort::descending(order)])
}

fn all_but_multiples_of(step: u32, count: u32) -> impl Iterator<Item = u32> {
    (0..count).filter(move |number| !number.is_multiple_of(step))
}

#[tokio::test]
async fn pages_the_few_forgotten_series_from_z_to_a() {
    let shelf = Shelf::holding("few-forgotten-pages", SHORT_SHELF).await;
    shelf.read([1, 4, 6, 9, 10].into_iter(), 0).await;
    shelf.read([2, 3, 5].into_iter(), READ_LATELY_MINUTES).await;
    let listing = SeriesListing {
        sort: SeriesSort::descending(SeriesOrder::Title),
        filter: FORGOTTEN,
    };

    let pages = shelf.pages(listing, PAGE_OF_TWO).await;

    assert_eq!(pages, pages_of(&[10, 9, 6, 4, 1], PAGE_OF_TWO.into()));
}

#[tokio::test]
async fn pages_hundreds_of_forgotten_series_from_a_to_z() {
    let shelf = Shelf::holding("many-forgotten-pages", LONG_SHELF).await;
    let forgotten: Vec<u32> = all_but_multiples_of(EVERY_SIXTH, LONG_SHELF).collect();
    shelf.read(forgotten.iter().copied(), 0).await;
    shelf
        .read(multiples_of(EVERY_SIXTH, LONG_SHELF), READ_LATELY_MINUTES)
        .await;
    let listing = SeriesListing {
        sort: SeriesSort::ascending(SeriesOrder::Title),
        filter: FORGOTTEN,
    };

    let pages = shelf.pages(listing, PAGE_OF_TWO_HUNDRED).await;

    assert_eq!(pages, pages_of(&forgotten, PAGE_OF_TWO_HUNDRED.into()));
}

#[tokio::test]
async fn pages_the_few_series_holding_a_book_stored_twice_by_latest_added() {
    let shelf = Shelf::holding("few-duplicated-pages", SHORT_SHELF).await;
    shelf.copy_into_backup([3, 7, 8, 11].into_iter()).await;
    let listing = SeriesListing {
        sort: SeriesSort::descending(SeriesOrder::DateAdded),
        filter: DUPLICATED,
    };

    let pages = shelf.pages(listing, PAGE_OF_THREE).await;

    assert_eq!(pages, pages_of(&[11, 8, 7, 3], PAGE_OF_THREE.into()));
}

#[tokio::test]
async fn pages_hundreds_of_series_holding_a_book_stored_twice_by_earliest_added() {
    let shelf = Shelf::holding("many-duplicated-pages", LONG_SHELF).await;
    let duplicated: Vec<u32> = all_but_multiples_of(EVERY_SIXTH, LONG_SHELF).collect();
    shelf.copy_into_backup(duplicated.iter().copied()).await;
    let listing = SeriesListing {
        sort: SeriesSort::ascending(SeriesOrder::DateAdded),
        filter: DUPLICATED,
    };

    let pages = shelf.pages(listing, PAGE_OF_TWO_HUNDRED).await;

    assert_eq!(pages, pages_of(&duplicated, PAGE_OF_TWO_HUNDRED.into()));
}

#[tokio::test]
async fn pages_the_few_series_a_smart_filter_matches_as_reading_each_stage_in_order_does_in_every_sort()
 {
    let shelf = Shelf::holding("few-matches-like-each-stage", MIXED_SHELF).await;
    shelf
        .read(multiples_of(EVERY_THIRD_READ_LONG_AGO, MIXED_SHELF), 0)
        .await;
    shelf.start(multiples_of(EVERY_SIXTH, MIXED_SHELF)).await;
    shelf
        .finish(multiples_of(EVERY_NINTH_FINISHED, MIXED_SHELF))
        .await;
    shelf
        .read(
            multiples_of(EVERY_FIFTH_READ_LATELY, MIXED_SHELF),
            READ_LATELY_MINUTES,
        )
        .await;
    shelf
        .copy_into_backup(multiples_of(EVERY_FOURTH_COPIED, MIXED_SHELF))
        .await;
    let forgotten = titles_of(
        multiples_of(EVERY_THIRD_READ_LONG_AGO, MIXED_SHELF)
            .filter(|number| !number.is_multiple_of(EVERY_FIFTH_READ_LATELY)),
    );
    let duplicated = titles_of(multiples_of(EVERY_FOURTH_COPIED, MIXED_SHELF));
    let forgotten_and_duplicated: BTreeSet<String> =
        forgotten.intersection(&duplicated).cloned().collect();
    let few_matches = [
        (FORGOTTEN, &forgotten),
        (
            SeriesFilter {
                finished: Inclusion::Hide,
                ..FORGOTTEN
            },
            &forgotten,
        ),
        (DUPLICATED, &duplicated),
        (
            SeriesFilter {
                started: Inclusion::Only,
                ..DUPLICATED
            },
            &duplicated,
        ),
        (
            SeriesFilter {
                duplicates: Inclusion::Only,
                ..FORGOTTEN
            },
            &forgotten_and_duplicated,
        ),
    ];

    for sort in every_sort() {
        for (filter, matching) in few_matches {
            let listing = SeriesListing { sort, filter };
            let listed = shelf.listed_series(listing, PAGE_OF_TWO).await;
            let walked = shelf.listed_by_each_stage_in_order(listing, matching).await;
            assert_eq!(listed, walked, "{listing:?}");
        }
    }
}
