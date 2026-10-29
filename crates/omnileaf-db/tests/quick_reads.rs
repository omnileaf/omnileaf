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

use std::path::PathBuf;

use omnileaf_db::{
    Error,
    catalog::{
        BookDetails, BookFile, BookPerson, Cursor, FolderGroup, Inclusion, NewRoot, NewSeries,
        Page, PageRequest, PageSize, PersonRole, RootId, RootKind, RootLocator, ScannedBook,
        SearchText, SeriesFilter, SeriesFolder, SeriesListing, SeriesNaming, SeriesOrder,
        SeriesSearch, SeriesSort, SeriesSummary, Sourced, ValueSource, add_root,
        category_series_count, category_series_page, folder_group_series_count,
        folder_group_series_page, folder_series_count, folder_series_page, record_scanned_books,
        search_count, search_page, series_count, series_page, writer_series_count,
        writer_series_page, writerless_series_count, writerless_series_page,
    },
    store::Store,
};
use omnileaf_sync_proto::{CategoryId, Fingerprint, ImageEntry, SeriesId};
use store_support::{FakeClock, NOW_UNIX_MS, book, open_store};
use support::ScratchFolder;

const SHELF: u32 = 600;
const PAGES_IN_A_CYCLE: u32 = 40;
const QUICK: u32 = 20;
const STARTED_AT: u32 = 1;
const EVERY_SIXTH_STARTED: u32 = 6;
const EVERY_NINTH_FINISHED: u32 = 9;
const EVERY_ELEVENTH_UNCOUNTED: u32 = 11;
const EVERY_SEVENTH_IN_JAPANESE: u32 = 7;
const EVERY_EIGHTH_RATED_ADULT: u32 = 8;
const EVERY_THIRTEENTH_TAGGED_STORMS: u32 = 13;
const EVERY_TENTH_BOOKMARKED: u32 = 10;
const EVERY_THIRD_READ_LONG_AGO: u32 = 3;
const EVERY_FIFTH_READ_LATELY: u32 = 5;
const EVERY_SECOND_WRITTEN: u32 = 2;
const EVERY_FOURTH_IN_A_CATEGORY: u32 = 4;
const READ_LONG_AGO_MS: i64 = 1_000;
const READ_LATELY_MS: i64 = 10_000;
const FORGOTTEN_BEFORE_MS: i64 = 5_000;
const BOOKMARKED_PAGE: u32 = 1;
const SHELF_FOLDER: &str = "Shelf";
const WRITER: &str = "Pat Writer";
const PAGE_OF_TWO: u16 = 2;
const PAGE_OF_TWO_HUNDRED: u16 = 200;
const ORDERS: [SeriesOrder; 6] = [
    SeriesOrder::Title,
    SeriesOrder::DateAdded,
    SeriesOrder::LastRead,
    SeriesOrder::LastUpdated,
    SeriesOrder::UnreadCount,
    SeriesOrder::TimeLeft,
];
const A_TO_Z: SeriesSort = SeriesSort::ascending(SeriesOrder::Title);

struct Shelf {
    store: Store,
    root: RootId,
    category: CategoryId,
    _folder: ScratchFolder,
}

impl Shelf {
    async fn holding_counted_pages(name: &str) -> Self {
        let folder = ScratchFolder::new(name);
        let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
        let root = store
            .database()
            .write(|transaction| add_root(transaction, &linked("/media/Comics")))
            .await
            .unwrap();
        let scanned: Vec<ScannedBook> = (0..SHELF).map(|number| scanned(root, number)).collect();
        store
            .database()
            .write(move |transaction| record_scanned_books(transaction, &scanned))
            .await
            .unwrap();
        let members: Vec<SeriesId> = multiples_of(EVERY_FOURTH_IN_A_CATEGORY)
            .map(|number| new_series(number).id())
            .collect();
        let category = store
            .write(move |writer| {
                let category = writer.create_category("Quick")?;
                writer.set_category_members(category, &members, true)?;
                Ok(category)
            })
            .await
            .unwrap();
        let shelf = Self {
            store,
            root,
            category,
            _folder: folder,
        };
        shelf.read_the_shelf().await;
        shelf
    }

    async fn read_the_shelf(&self) {
        self.set_positions(multiples_of(EVERY_SIXTH_STARTED), STARTED_AT)
            .await;
        self.mark_read(multiples_of(EVERY_NINTH_FINISHED), true)
            .await;
        self.store
            .database()
            .write(|transaction| {
                for number in multiples_of(EVERY_ELEVENTH_UNCOUNTED) {
                    transaction.execute(
                        "UPDATE book SET page_count = NULL WHERE id = ?1",
                        [book(number).as_bytes()],
                    )?;
                }
                for number in multiples_of(EVERY_SEVENTH_IN_JAPANESE) {
                    transaction.execute(
                        "UPDATE series SET language = 'ja', language_source = 'files'
                        WHERE title = ?1",
                        [series_name(number)],
                    )?;
                }
                for number in multiples_of(EVERY_EIGHTH_RATED_ADULT) {
                    transaction.execute(
                        "UPDATE series SET adult_rated_books = 1 WHERE title = ?1",
                        [series_name(number)],
                    )?;
                }
                for number in multiples_of(EVERY_THIRD_READ_LONG_AGO) {
                    transaction.execute(
                        "UPDATE series SET last_read_at_ms = ?2 WHERE title = ?1",
                        (series_name(number), READ_LONG_AGO_MS),
                    )?;
                }
                for number in multiples_of(EVERY_FIFTH_READ_LATELY) {
                    transaction.execute(
                        "UPDATE series SET last_read_at_ms = ?2 WHERE title = ?1",
                        (series_name(number), READ_LATELY_MS),
                    )?;
                }
                for number in multiples_of(EVERY_THIRTEENTH_TAGGED_STORMS) {
                    transaction.execute(
                        "INSERT OR IGNORE INTO book_details (book_id) VALUES (?1)",
                        [book(number).as_bytes()],
                    )?;
                    transaction.execute(
                        "INSERT INTO book_tag (book_id, kind, name) VALUES (?1, 'tag', 'storms')",
                        [book(number).as_bytes()],
                    )?;
                }
                Ok(())
            })
            .await
            .unwrap();
        let bookmarked: Vec<u32> = multiples_of(EVERY_TENTH_BOOKMARKED).collect();
        self.store
            .write(move |writer| {
                bookmarked
                    .into_iter()
                    .try_for_each(|number| writer.set_bookmark(book(number), BOOKMARKED_PAGE, true))
            })
            .await
            .unwrap();
    }

    async fn set_positions(&self, numbers: impl Iterator<Item = u32>, page: u32) {
        let numbers: Vec<u32> = numbers.collect();
        self.store
            .write(move |writer| {
                numbers
                    .into_iter()
                    .try_for_each(|number| writer.set_position(book(number), page))
            })
            .await
            .unwrap();
    }

    async fn mark_read(&self, numbers: impl Iterator<Item = u32>, is_read: bool) {
        let numbers: Vec<u32> = numbers.collect();
        self.store
            .write(move |writer| {
                numbers
                    .into_iter()
                    .try_for_each(|number| writer.set_read(book(number), is_read))
            })
            .await
            .unwrap();
    }

    async fn pages(&self, listing: SeriesListing, size: u16) -> Vec<Vec<String>> {
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
            pages.push(page.items.into_iter().map(|series| series.title).collect());
            let Some(next) = page.next else {
                return pages;
            };
            after = Some(next);
        }
    }

    async fn titles(&self, filter: SeriesFilter) -> Vec<String> {
        let listing = SeriesListing {
            sort: A_TO_Z,
            filter,
        };
        self.pages(listing, PAGE_OF_TWO_HUNDRED)
            .await
            .into_iter()
            .flatten()
            .collect()
    }

    async fn count(&self, filter: SeriesFilter) -> u32 {
        self.store
            .database()
            .read(move |connection| series_count(connection, &filter))
            .await
            .unwrap()
    }

    async fn every_listing(&self, filter: SeriesFilter) -> Vec<Listed> {
        let root = self.root;
        let category = self.category;
        let group = FolderGroup {
            root,
            location: PathBuf::from(SHELF_FOLDER),
        };
        let search = SeriesSearch {
            text: SearchText::parse("Sample Series").unwrap().unwrap(),
            filter: filter.clone(),
        };
        let listing = SeriesListing {
            sort: A_TO_Z,
            filter: filter.clone(),
        };
        self.store
            .database()
            .read(move |connection| {
                Ok(vec![
                    Listed {
                        name: "library",
                        titles: drain(|request| series_page(connection, &listing, request))?,
                        count: series_count(connection, &filter)?,
                        holds: |_| true,
                    },
                    Listed {
                        name: "search",
                        titles: drain(|request| search_page(connection, &search, request))?,
                        count: search_count(connection, &search)?,
                        holds: |_| true,
                    },
                    Listed {
                        name: "folder",
                        titles: drain(|request| {
                            folder_series_page(connection, root, &listing, request)
                        })?,
                        count: folder_series_count(connection, root, &filter)?,
                        holds: |_| true,
                    },
                    Listed {
                        name: "folder group",
                        titles: drain(|request| {
                            folder_group_series_page(connection, &group, &listing, request)
                        })?,
                        count: folder_group_series_count(connection, &group, &filter)?,
                        holds: |_| true,
                    },
                    Listed {
                        name: "category",
                        titles: drain(|request| {
                            category_series_page(connection, category, &listing, request)
                        })?,
                        count: category_series_count(connection, category, &filter)?,
                        holds: |number| number.is_multiple_of(EVERY_FOURTH_IN_A_CATEGORY),
                    },
                    Listed {
                        name: "writer",
                        titles: drain(|request| {
                            writer_series_page(connection, WRITER, &listing, request)
                        })?,
                        count: writer_series_count(connection, WRITER, &filter)?,
                        holds: |number| number.is_multiple_of(EVERY_SECOND_WRITTEN),
                    },
                    Listed {
                        name: "writerless",
                        titles: drain(|request| {
                            writerless_series_page(connection, &listing, request)
                        })?,
                        count: writerless_series_count(connection, &filter)?,
                        holds: |number| !number.is_multiple_of(EVERY_SECOND_WRITTEN),
                    },
                ])
            })
            .await
            .unwrap()
    }
}

type Holds = fn(u32) -> bool;

struct Listed {
    name: &'static str,
    titles: Vec<String>,
    count: u32,
    holds: Holds,
}

fn drain(
    mut fetch: impl FnMut(&PageRequest) -> Result<Page<SeriesSummary>, Error>,
) -> Result<Vec<String>, Error> {
    let mut titles = Vec::new();
    let mut after: Option<Cursor> = None;
    loop {
        let request = PageRequest {
            after,
            size: PageSize::try_from(PAGE_OF_TWO_HUNDRED).unwrap(),
        };
        let page = fetch(&request)?;
        titles.extend(page.items.into_iter().map(|series| series.title));
        let Some(next) = page.next else {
            return Ok(titles);
        };
        after = Some(next);
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

fn new_series(number: u32) -> NewSeries {
    let name = series_name(number);
    let location = PathBuf::from(SHELF_FOLDER).join(&name);
    NewSeries::folder(
        SeriesFolder {
            linked_folder: "Comics",
            location: &location,
        },
        SeriesNaming {
            title: Sourced {
                value: name,
                source: ValueSource::FolderName,
            },
            year: None,
        },
        i64::from(number),
    )
    .unwrap()
}

fn scanned(root: RootId, number: u32) -> ScannedBook {
    let page = ImageEntry {
        crc32: number,
        size: 1,
    };
    let name = series_name(number);
    let people = if number.is_multiple_of(EVERY_SECOND_WRITTEN) {
        vec![BookPerson {
            role: PersonRole::Writer,
            name: WRITER.to_owned(),
        }]
    } else {
        Vec::new()
    };
    ScannedBook {
        series: new_series(number),
        named_series: None,
        fingerprint: Fingerprint::pmf1([page]).unwrap(),
        title: "Volume 01".to_owned(),
        added_at_ms: i64::from(number),
        page_count: pages_in(number),
        details: BookDetails {
            people,
            ..BookDetails::default()
        },
        numbering: None,
        name_language: None,
        file: BookFile {
            root,
            location: PathBuf::from(format!("{SHELF_FOLDER}/{name}/Volume 01.cbz")),
            size_bytes: 1,
            modified_at_ms: 0,
        },
    }
}

fn multiples_of(step: u32) -> impl Iterator<Item = u32> {
    (0..SHELF).filter(move |number| number.is_multiple_of(step))
}

const fn pages_in(number: u32) -> u32 {
    number % PAGES_IN_A_CYCLE + 1
}

const fn is_finished(number: u32) -> bool {
    number.is_multiple_of(EVERY_NINTH_FINISHED)
}

const fn is_uncounted(number: u32) -> bool {
    number.is_multiple_of(EVERY_ELEVENTH_UNCOUNTED) && !is_finished(number)
}

const fn is_started(number: u32) -> bool {
    is_finished(number) || number.is_multiple_of(EVERY_SIXTH_STARTED)
}

const fn pages_left(number: u32) -> Option<u32> {
    if is_finished(number) {
        Some(0)
    } else if is_uncounted(number) {
        None
    } else if is_started(number) {
        Some(pages_in(number).saturating_sub(STARTED_AT))
    } else {
        Some(pages_in(number))
    }
}

fn is_quick(number: u32, most: u32) -> bool {
    pages_left(number).is_some_and(|left| 0 < left && left <= most)
}

fn is_forgotten(number: u32) -> bool {
    number.is_multiple_of(EVERY_THIRD_READ_LONG_AGO)
        && !number.is_multiple_of(EVERY_FIFTH_READ_LATELY)
}

fn titles_where(holds: impl Fn(u32) -> bool) -> Vec<String> {
    (0..SHELF)
        .filter(|&number| holds(number))
        .map(series_name)
        .collect()
}

fn pages_of(titles: &[String], size: u16) -> Vec<Vec<String>> {
    titles.chunks(size.into()).map(<[String]>::to_vec).collect()
}

fn pages_left_at_most(most: u32) -> SeriesFilter {
    SeriesFilter::NONE.with_pages_left_at_most(Some(most))
}

fn every_sort() -> impl Iterator<Item = SeriesSort> {
    ORDERS
        .into_iter()
        .flat_map(|order| [SeriesSort::ascending(order), SeriesSort::descending(order)])
}

#[tokio::test]
async fn pages_the_series_with_pages_left_up_to_the_bound_in_every_sort() {
    let shelf = Shelf::holding_counted_pages("quick-reads-every-sort").await;

    for sort in every_sort() {
        let in_order = shelf
            .pages(SeriesListing::unfiltered(sort), PAGE_OF_TWO_HUNDRED)
            .await
            .concat();
        let wanted: Vec<String> = titles_where(|number| is_quick(number, QUICK));
        let quick: Vec<String> = in_order
            .into_iter()
            .filter(|title| wanted.contains(title))
            .collect();
        for size in [PAGE_OF_TWO, PAGE_OF_TWO_HUNDRED] {
            let listing = SeriesListing {
                sort,
                filter: pages_left_at_most(QUICK),
            };

            let pages = shelf.pages(listing, size).await;

            assert!(!quick.is_empty());
            assert_eq!(pages, pages_of(&quick, size), "{sort:?} by {size}");
        }
    }
}

#[tokio::test]
async fn lists_no_series_for_a_bound_of_no_pages() {
    let shelf = Shelf::holding_counted_pages("quick-reads-no-pages").await;

    let titles = shelf.titles(pages_left_at_most(0)).await;

    assert_eq!(titles, Vec::<String>::new());
}

#[tokio::test]
async fn never_lists_a_series_holding_a_book_whose_pages_are_not_counted_even_at_the_largest_bound()
{
    let shelf = Shelf::holding_counted_pages("quick-reads-uncounted").await;

    let titles = shelf.titles(pages_left_at_most(u32::MAX)).await;

    let uncounted = titles_where(is_uncounted);
    assert!(!uncounted.is_empty());
    assert!(titles.iter().all(|title| !uncounted.contains(title)));
    assert_eq!(titles, titles_where(|number| is_quick(number, u32::MAX)));
}

#[tokio::test]
async fn never_lists_a_finished_series() {
    let shelf = Shelf::holding_counted_pages("quick-reads-finished").await;

    let titles = shelf.titles(pages_left_at_most(u32::MAX)).await;

    let finished = titles_where(is_finished);
    assert!(!finished.is_empty());
    assert!(titles.iter().all(|title| !finished.contains(title)));
}

#[tokio::test]
async fn lists_no_series_asking_for_the_finished_ones_within_a_bound() {
    let shelf = Shelf::holding_counted_pages("quick-reads-only-finished").await;
    let finished_only = pages_left_at_most(u32::MAX).with_finished(Inclusion::Only);

    let titles = shelf.titles(finished_only.clone()).await;
    let count = shelf.count(finished_only).await;

    assert_eq!((titles, count), (Vec::<String>::new(), 0));
}

#[tokio::test]
async fn counts_the_series_it_lists() {
    let shelf = Shelf::holding_counted_pages("quick-reads-count").await;

    for most in [0, 1, QUICK, u32::MAX] {
        let count = shelf.count(pages_left_at_most(most)).await;

        let wanted = titles_where(|number| is_quick(number, most)).len();
        assert_eq!(count, u32::try_from(wanted).unwrap(), "at most {most}");
    }
}

#[tokio::test]
async fn lists_a_series_once_a_page_turned_forward_leaves_few_enough_pages() {
    let shelf = Shelf::holding_counted_pages("quick-reads-page-forward").await;
    let long = (0..SHELF)
        .find(|&number| pages_left(number).is_some_and(|left| left > QUICK))
        .unwrap();
    assert!(
        !shelf
            .titles(pages_left_at_most(QUICK))
            .await
            .contains(&series_name(long))
    );

    shelf
        .set_positions(std::iter::once(long), pages_in(long) - QUICK)
        .await;

    let titles = shelf.titles(pages_left_at_most(QUICK)).await;
    assert!(titles.contains(&series_name(long)));
    assert_eq!(
        shelf.count(pages_left_at_most(QUICK)).await as usize,
        titles.len()
    );
}

#[tokio::test]
async fn leaves_a_series_out_once_its_book_is_marked_read() {
    let shelf = Shelf::holding_counted_pages("quick-reads-marked-read").await;
    let quick = (0..SHELF).find(|&number| is_quick(number, QUICK)).unwrap();
    assert!(
        shelf
            .titles(pages_left_at_most(QUICK))
            .await
            .contains(&series_name(quick))
    );

    shelf.mark_read(std::iter::once(quick), true).await;

    let titles = shelf.titles(pages_left_at_most(QUICK)).await;
    assert!(!titles.contains(&series_name(quick)));
    assert_eq!(
        shelf.count(pages_left_at_most(QUICK)).await as usize,
        titles.len()
    );
}

#[tokio::test]
async fn leaves_a_series_out_once_its_last_pages_are_reached() {
    let shelf = Shelf::holding_counted_pages("quick-reads-last-page").await;
    let quick = (0..SHELF).find(|&number| is_quick(number, QUICK)).unwrap();

    shelf
        .set_positions(std::iter::once(quick), pages_in(quick))
        .await;

    let titles = shelf.titles(pages_left_at_most(QUICK)).await;
    assert!(!titles.contains(&series_name(quick)));
}

fn combinations() -> Vec<(SeriesFilter, Holds)> {
    let quick = pages_left_at_most(QUICK);
    vec![
        (quick.clone().with_unread(Inclusion::Only), |number| {
            !is_finished(number)
        }),
        (quick.clone().with_started(Inclusion::Only), is_started),
        (quick.clone().with_started(Inclusion::Hide), |number| {
            !is_started(number)
        }),
        (quick.clone().with_finished(Inclusion::Hide), |number| {
            !is_finished(number)
        }),
        (
            quick.clone().with_tags(vec!["storms".to_owned()]),
            |number| number.is_multiple_of(EVERY_THIRTEENTH_TAGGED_STORMS),
        ),
        (
            quick.clone().with_languages(vec!["ja".to_owned()]),
            |number| number.is_multiple_of(EVERY_SEVENTH_IN_JAPANESE),
        ),
        (quick.clone().with_bookmarked(Inclusion::Only), |number| {
            number.is_multiple_of(EVERY_TENTH_BOOKMARKED)
        }),
        (quick.clone().with_adult(Inclusion::Hide, true), |number| {
            !number.is_multiple_of(EVERY_EIGHTH_RATED_ADULT)
        }),
        (
            quick.with_last_read_before_ms(Some(FORGOTTEN_BEFORE_MS)),
            is_forgotten,
        ),
    ]
}

#[tokio::test]
async fn combines_with_each_other_filter_and_counts_what_it_lists() {
    let shelf = Shelf::holding_counted_pages("quick-reads-combined").await;

    for (filter, holds) in combinations() {
        let titles = shelf.titles(filter.clone()).await;
        let count = shelf.count(filter.clone()).await;

        let wanted = titles_where(|number| is_quick(number, QUICK) && holds(number));
        assert!(!wanted.is_empty(), "{filter:?}");
        assert_eq!(titles, wanted, "{filter:?}");
        assert_eq!(count as usize, wanted.len(), "{filter:?}");
    }
}

#[tokio::test]
async fn bounds_every_listing_that_shares_the_conditions() {
    let shelf = Shelf::holding_counted_pages("quick-reads-every-listing").await;

    for filter in [
        pages_left_at_most(QUICK),
        pages_left_at_most(QUICK).with_unread(Inclusion::Only),
    ] {
        for listed in shelf.every_listing(filter.clone()).await {
            let wanted = titles_where(|number| {
                (listed.holds)(number)
                    && is_quick(number, QUICK)
                    && (filter.unread == Inclusion::Any || !is_finished(number))
            });

            assert!(!wanted.is_empty(), "{} with {filter:?}", listed.name);
            assert_eq!(listed.titles, wanted, "{} with {filter:?}", listed.name);
            assert_eq!(
                listed.count as usize,
                wanted.len(),
                "{} count with {filter:?}",
                listed.name
            );
        }
    }
}
