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
        RootId, RootKind, RootLocator, ScannedBook, SeriesFilter, SeriesFormat, SeriesListing,
        SeriesOrder, SeriesSort, SeriesSummary, add_root, record_scanned_books, series_page,
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
const EVERY_SEVENTH_IN_JAPANESE: u32 = 7;
const EVERY_EIGHTH_RATED_ADULT: u32 = 8;
const EVERY_ELEVENTH_TAGGED_STORMS: u32 = 11;
const EVERY_THIRTEENTH_TAGGED_HARBOUR: u32 = 13;
const EVERY_SEVENTEENTH_MANGA: u32 = 17;
const EVERY_NINETEENTH_ON_THE_LAST_PAGE_BUT_ONE: u32 = 19;
const LAST_PAGE_BUT_ONE: u32 = PAGE_COUNT - 1;
const ONE_PAGE_LEFT: u32 = 1;
const PAGE_OF_TWO: u16 = 2;
const PAGE_OF_THREE: u16 = 3;
const PAGE_OF_TWO_HUNDRED: u16 = 200;
const FORGOTTEN: SeriesFilter = SeriesFilter::NONE.with_last_read_before_ms(Some(
    (NOW_UNIX_MS + FORGOTTEN_BEFORE_MINUTES * MINUTE_MS).cast_signed(),
));
const DUPLICATED: SeriesFilter = SeriesFilter::NONE.with_duplicates(Inclusion::Only);
const QUICK_READS: SeriesFilter = SeriesFilter::NONE.with_pages_left_at_most(Some(ONE_PAGE_LEFT));
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

    async fn name_language_and_rating(
        &self,
        japanese: impl Iterator<Item = u32>,
        rated_adult: impl Iterator<Item = u32>,
    ) {
        let japanese: Vec<String> = japanese.map(series_name).collect();
        let rated_adult: Vec<String> = rated_adult.map(series_name).collect();
        self.store
            .database()
            .write(move |transaction| {
                let mut in_japanese = transaction.prepare(
                    "UPDATE series SET language = 'ja', language_source = 'files' WHERE title = ?1",
                )?;
                for title in &japanese {
                    in_japanese.execute([title])?;
                }
                let mut adult = transaction
                    .prepare("UPDATE series SET adult_rated_books = 1 WHERE title = ?1")?;
                for title in &rated_adult {
                    adult.execute([title])?;
                }
                Ok(())
            })
            .await
            .unwrap();
    }

    async fn tag(&self, tag: &'static str, numbers: impl Iterator<Item = u32>) {
        let titles: Vec<String> = numbers.map(series_name).collect();
        self.store
            .database()
            .write(move |transaction| {
                let mut details = transaction.prepare(
                    "INSERT OR IGNORE INTO book_details (book_id)
                    SELECT book.id FROM book JOIN series ON series.local_id = book.series_local_id
                    WHERE series.title = ?1",
                )?;
                let mut tagged = transaction.prepare(
                    "INSERT OR IGNORE INTO book_tag (book_id, kind, name)
                    SELECT book.id, 'tag', ?2 FROM book
                    JOIN series ON series.local_id = book.series_local_id
                    WHERE series.title = ?1",
                )?;
                for title in &titles {
                    details.execute([title])?;
                    tagged.execute((title, tag))?;
                }
                Ok(())
            })
            .await
            .unwrap();
    }

    async fn mark_manga(&self, numbers: impl Iterator<Item = u32>) {
        let titles: Vec<String> = numbers.map(series_name).collect();
        self.store
            .database()
            .write(move |transaction| {
                let mut manga = transaction.prepare(
                    "INSERT INTO book_details (book_id, is_manga)
                    SELECT book.id, 1 FROM book JOIN series ON series.local_id = book.series_local_id
                    WHERE series.title = ?1
                    ON CONFLICT (book_id) DO UPDATE SET is_manga = 1",
                )?;
                for title in &titles {
                    manga.execute([title])?;
                }
                Ok(())
            })
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

    async fn move_to_page(&self, numbers: impl Iterator<Item = u32>, page: u32) {
        self.write_each_book(numbers, move |writer, book| writer.set_position(book, page))
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
                languages: Vec::new(),
                tags: Vec::new(),
                formats: Vec::new(),
                adult: Inclusion::Any,
                pages_left_at_most: None,
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
            let listing = listing.clone();
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
        named_series: None,
        fingerprint: Fingerprint::pmf1([page]).unwrap(),
        title: "Volume 01".to_owned(),
        added_at_ms: i64::from(number),
        page_count: PAGE_COUNT,
        details: BookDetails::default(),
        numbering: None,
        name_language: None,
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

async fn mixed_shelf() -> Shelf {
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
    shelf
        .name_language_and_rating(
            multiples_of(EVERY_SEVENTH_IN_JAPANESE, MIXED_SHELF),
            multiples_of(EVERY_EIGHTH_RATED_ADULT, MIXED_SHELF),
        )
        .await;
    shelf
        .tag(
            "storms",
            multiples_of(EVERY_ELEVENTH_TAGGED_STORMS, MIXED_SHELF),
        )
        .await;
    shelf
        .tag(
            "harbour",
            multiples_of(EVERY_THIRTEENTH_TAGGED_HARBOUR, MIXED_SHELF),
        )
        .await;
    shelf
        .mark_manga(multiples_of(EVERY_SEVENTEENTH_MANGA, MIXED_SHELF))
        .await;
    shelf
        .move_to_page(
            multiples_of(EVERY_NINETEENTH_ON_THE_LAST_PAGE_BUT_ONE, MIXED_SHELF),
            LAST_PAGE_BUT_ONE,
        )
        .await;
    shelf
}

fn series_of(step: u32) -> BTreeSet<String> {
    titles_of(multiples_of(step, MIXED_SHELF))
}

fn also(one: &BTreeSet<String>, other: &BTreeSet<String>) -> BTreeSet<String> {
    one.intersection(other).cloned().collect()
}

fn tagged_with(tags: &[&str]) -> SeriesFilter {
    SeriesFilter::NONE.with_tags(tags.iter().map(|&tag| tag.to_owned()).collect())
}

/// Each filter that matches few of the shelf's series, with the series it matches.
fn few_matches() -> Vec<(SeriesFilter, BTreeSet<String>)> {
    let forgotten = titles_of(
        multiples_of(EVERY_THIRD_READ_LONG_AGO, MIXED_SHELF)
            .filter(|number| !number.is_multiple_of(EVERY_FIFTH_READ_LATELY)),
    );
    let duplicated = series_of(EVERY_FOURTH_COPIED);
    let japanese = series_of(EVERY_SEVENTH_IN_JAPANESE);
    let stormy = series_of(EVERY_ELEVENTH_TAGGED_STORMS);
    let quick = titles_of(
        multiples_of(EVERY_NINETEENTH_ON_THE_LAST_PAGE_BUT_ONE, MIXED_SHELF)
            .filter(|number| !number.is_multiple_of(EVERY_NINTH_FINISHED)),
    );
    let in_japanese = SeriesFilter::NONE.with_languages(vec!["ja".to_owned()]);
    vec![
        (FORGOTTEN, forgotten.clone()),
        (FORGOTTEN.with_finished(Inclusion::Hide), forgotten.clone()),
        (DUPLICATED, duplicated.clone()),
        (DUPLICATED.with_started(Inclusion::Only), duplicated.clone()),
        (
            FORGOTTEN.with_duplicates(Inclusion::Only),
            also(&forgotten, &duplicated),
        ),
        (in_japanese.clone(), japanese.clone()),
        (
            SeriesFilter::NONE.with_adult(Inclusion::Only, true),
            series_of(EVERY_EIGHTH_RATED_ADULT),
        ),
        (
            in_japanese.with_duplicates(Inclusion::Only),
            also(&japanese, &duplicated),
        ),
        (
            SeriesFilter::NONE.with_formats(vec![SeriesFormat::Manga]),
            series_of(EVERY_SEVENTEENTH_MANGA),
        ),
        (QUICK_READS, quick.clone()),
        (QUICK_READS.with_finished(Inclusion::Hide), quick.clone()),
        (QUICK_READS.with_started(Inclusion::Only), quick.clone()),
        (
            QUICK_READS.with_last_read_before_ms(FORGOTTEN.last_read_before_ms),
            also(&forgotten, &quick),
        ),
        (
            QUICK_READS.with_duplicates(Inclusion::Only),
            also(&duplicated, &quick),
        ),
        (tagged_with(&["storms"]), stormy.clone()),
        (
            tagged_with(&["storms", "harbour"]),
            stormy
                .union(&series_of(EVERY_THIRTEENTH_TAGGED_HARBOUR))
                .cloned()
                .collect(),
        ),
        (
            tagged_with(&["storms"]).with_duplicates(Inclusion::Only),
            also(&stormy, &duplicated),
        ),
    ]
}

#[tokio::test]
async fn pages_the_few_series_a_smart_filter_matches_as_reading_each_stage_in_order_does_in_every_sort()
 {
    let shelf = mixed_shelf().await;

    for sort in every_sort() {
        for (filter, matching) in few_matches() {
            let listing = SeriesListing { sort, filter };
            let listed = shelf.listed_series(listing.clone(), PAGE_OF_TWO).await;
            let walked = shelf
                .listed_by_each_stage_in_order(listing.clone(), &matching)
                .await;
            assert_eq!(listed, walked, "{listing:?}");
        }
    }
}

#[tokio::test]
async fn pages_hundreds_of_quick_reads_from_z_to_a() {
    let shelf = Shelf::holding("many-quick-reads-pages", LONG_SHELF).await;
    let quick: Vec<u32> = all_but_multiples_of(EVERY_SIXTH, LONG_SHELF).collect();
    shelf
        .move_to_page(quick.iter().copied(), LAST_PAGE_BUT_ONE)
        .await;
    let listing = SeriesListing {
        sort: SeriesSort::descending(SeriesOrder::Title),
        filter: QUICK_READS,
    };

    let pages = shelf.pages(listing, PAGE_OF_TWO_HUNDRED).await;

    let from_z_to_a: Vec<u32> = quick.into_iter().rev().collect();
    assert_eq!(pages, pages_of(&from_z_to_a, PAGE_OF_TWO_HUNDRED.into()));
}

#[tokio::test]
async fn pages_hundreds_of_quick_reads_that_are_also_forgotten_and_stored_twice() {
    let shelf = Shelf::holding("many-quick-forgotten-duplicated-pages", LONG_SHELF).await;
    let quick: Vec<u32> = all_but_multiples_of(EVERY_SIXTH, LONG_SHELF).collect();
    shelf.read(quick.iter().copied(), 0).await;
    shelf.copy_into_backup(quick.iter().copied()).await;
    shelf
        .move_to_page(quick.iter().copied(), LAST_PAGE_BUT_ONE)
        .await;
    let listing = SeriesListing {
        sort: SeriesSort::ascending(SeriesOrder::DateAdded),
        filter: QUICK_READS
            .with_last_read_before_ms(FORGOTTEN.last_read_before_ms)
            .with_duplicates(Inclusion::Only),
    };

    let pages = shelf.pages(listing, PAGE_OF_TWO_HUNDRED).await;

    assert_eq!(pages, pages_of(&quick, PAGE_OF_TWO_HUNDRED.into()));
}
