#![expect(
    clippy::unwrap_used,
    reason = "the test builds its own scratch library, so a failed set-up should stop it"
)]

mod library_seed;
mod support;

use std::time::{Duration, Instant};

use library_seed::{SeriesSeed, seed_library};
use omnileaf_db::{
    Database,
    catalog::{
        Inclusion, PageRequest, PageSize, SeriesFilter, SeriesListing, SeriesOrder, SeriesSort,
        series_count, series_page,
    },
};
use support::{ScratchFolder, library_config};

const SERIES_COUNT: u32 = 10_000;
const BOOK_TITLES: [&str; 10] = [
    "Volume 01",
    "Volume 02",
    "Volume 03",
    "Volume 04",
    "Volume 05",
    "Volume 06",
    "Volume 07",
    "Volume 08",
    "Volume 09",
    "Volume 10",
];
const EVERY_HUNDREDTH_FINISHED: u32 = 100;
const EVERY_TENTH_STARTED: u32 = 10;
const PAGE_SIZE: u16 = 100;
const WALKS: usize = 3;
const COUNTS: usize = 20;
const BUDGET: Duration = Duration::from_millis(5);
const PERCENTILE: usize = 95;

const SORTS: [SeriesSort; 4] = [
    SeriesSort::ascending(SeriesOrder::Title),
    SeriesSort::descending(SeriesOrder::Title),
    SeriesSort::ascending(SeriesOrder::DateAdded),
    SeriesSort::descending(SeriesOrder::DateAdded),
];

/// No filter, and each condition alone either way, which takes in the filters matching a hundredth of the library and so reading furthest for a page.
const FILTERS: [SeriesFilter; 7] = [
    SeriesFilter::NONE,
    SeriesFilter {
        unread: Inclusion::Only,
        ..SeriesFilter::NONE
    },
    SeriesFilter {
        unread: Inclusion::Hide,
        ..SeriesFilter::NONE
    },
    SeriesFilter {
        started: Inclusion::Only,
        ..SeriesFilter::NONE
    },
    SeriesFilter {
        started: Inclusion::Hide,
        ..SeriesFilter::NONE
    },
    SeriesFilter {
        finished: Inclusion::Only,
        ..SeriesFilter::NONE
    },
    SeriesFilter {
        finished: Inclusion::Hide,
        ..SeriesFilter::NONE
    },
];

#[tokio::test]
#[expect(
    clippy::print_stderr,
    reason = "the gate logs the measured timings so each platform's margin under the budget shows on every run"
)]
#[ignore = "a timing budget means something only in an optimised build, so the gate runs it on its own in release"]
async fn reads_each_sorted_and_filtered_page_of_10_000_series_within_5_ms_at_p95() {
    let folder = ScratchFolder::new("filtered-page-speed");
    let database = Database::open(&library_config(&folder)).unwrap();
    add_generated_library(&database).await;

    let mut slowest_case = (Duration::ZERO, String::new());
    for sort in SORTS {
        for filter in FILTERS {
            let listing = SeriesListing { sort, filter };
            walk_pages(&database, listing).await;
            let mut timings: Vec<Duration> = Vec::new();
            for _ in 0..WALKS {
                timings.extend(walk_pages(&database, listing).await);
            }
            let p95 = percentile(&mut timings);
            eprintln!("{listing:?}: p95 {p95:?} over {} pages", timings.len());
            if p95 > slowest_case.0 {
                slowest_case = (p95, format!("{listing:?}"));
            }
        }
    }
    eprintln!(
        "slowest p95 of a page of {PAGE_SIZE} from {SERIES_COUNT} series: {:?} for {}, budget {BUDGET:?}",
        slowest_case.0, slowest_case.1
    );

    assert!(
        slowest_case.0 <= BUDGET,
        "a page of {} took {:?} at p95, over the {BUDGET:?} budget",
        slowest_case.1,
        slowest_case.0
    );
}

#[tokio::test]
#[expect(
    clippy::print_stderr,
    reason = "the gate logs the measured timings so each platform's margin under the budget shows on every run"
)]
#[ignore = "a timing budget means something only in an optimised build, so the gate runs it on its own in release"]
async fn counts_the_filtered_series_of_10_000_within_5_ms_at_p95() {
    let folder = ScratchFolder::new("filtered-count-speed");
    let database = Database::open(&library_config(&folder)).unwrap();
    add_generated_library(&database).await;

    let mut slowest_case = (Duration::ZERO, SeriesFilter::NONE);
    for filter in FILTERS {
        time_count(&database, filter).await;
        let mut timings: Vec<Duration> = Vec::new();
        for _ in 0..COUNTS {
            timings.push(time_count(&database, filter).await);
        }
        let p95 = percentile(&mut timings);
        eprintln!("{filter:?}: p95 {p95:?} over {COUNTS} counts");
        if p95 > slowest_case.0 {
            slowest_case = (p95, filter);
        }
    }
    eprintln!(
        "slowest p95 of a count of {SERIES_COUNT} series: {:?} for {:?}, budget {BUDGET:?}",
        slowest_case.0, slowest_case.1
    );

    assert!(
        slowest_case.0 <= BUDGET,
        "counting through {:?} took {:?} at p95, over the {BUDGET:?} budget",
        slowest_case.1,
        slowest_case.0
    );
}

fn percentile(timings: &mut [Duration]) -> Duration {
    timings.sort_unstable();
    let index = (timings.len() * PERCENTILE).div_ceil(100).saturating_sub(1);
    timings.get(index).copied().unwrap()
}

/// Adds ten books to each series, then marks every book of each hundredth series read and the first book of each tenth.
async fn add_generated_library(database: &Database) {
    let names: Vec<(String, i64)> = (0..SERIES_COUNT)
        .map(|number| (format!("Sample Series {number:05}"), i64::from(number)))
        .collect();
    let series: Vec<SeriesSeed<'_>> = names
        .iter()
        .map(|(name, added_at_ms)| SeriesSeed {
            added_at_ms: *added_at_ms,
            book_titles: &BOOK_TITLES,
            ..SeriesSeed::named(name)
        })
        .collect();
    seed_library(database, &series).await;
    database
        .write(|transaction| {
            transaction.execute(
                "INSERT INTO book_state (book_id, is_read)
                SELECT book.id, 1 FROM book JOIN series ON series.local_id = book.series_local_id
                WHERE series.added_at_ms % ?1 = 0
                    OR (series.added_at_ms % ?2 = 0 AND book.title = ?3)",
                (
                    EVERY_HUNDREDTH_FINISHED,
                    EVERY_TENTH_STARTED,
                    BOOK_TITLES[0],
                ),
            )?;
            Ok(())
        })
        .await
        .unwrap();
}

/// Times each page from the caller's side, waiting for a reader included.
async fn walk_pages(database: &Database, listing: SeriesListing) -> Vec<Duration> {
    let mut timings = Vec::new();
    let mut after = None;
    loop {
        let request = PageRequest {
            after,
            size: PageSize::try_from(PAGE_SIZE).unwrap(),
        };
        let started = Instant::now();
        let page = database
            .read(move |connection| series_page(connection, &listing, &request))
            .await
            .unwrap();
        timings.push(started.elapsed());
        after = page.next;
        if after.is_none() {
            return timings;
        }
    }
}

async fn time_count(database: &Database, filter: SeriesFilter) -> Duration {
    let started = Instant::now();
    database
        .read(move |connection| series_count(connection, &filter))
        .await
        .unwrap();
    started.elapsed()
}
