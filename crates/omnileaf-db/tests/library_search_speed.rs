#![expect(
    clippy::unwrap_used,
    reason = "the test builds its own scratch library, so a failed set-up should stop it"
)]

mod library_seed;
mod speed;
mod support;

use std::{mem, num::NonZeroUsize, time::Duration};

use omnileaf_db::{
    Database,
    catalog::{
        Cursor, Inclusion, PageRequest, PageSize, SearchText, SeriesFilter, SeriesSearch,
        search_count, search_page,
    },
};
use omnileaf_testkit::{Sampling, SpeedTrial, Statistic, TimingBudget};
use speed::add_generated_series;
use support::{ScratchFolder, library_config};

const BOOK_TITLES: [&str; 1] = ["Volume 01"];
const EVERY_HUNDREDTH_FINISHED: u32 = 100;
const PAGE_SIZE: u16 = 50;
const SAMPLES: usize = 40;
const BUDGET: Duration = Duration::from_millis(10);

const TEXTS: [&str; 9] = [
    "sample",
    "sample series",
    "series 09",
    "series 091",
    "09123",
    "lantern",
    "s",
    "12",
    "zz",
];

/// No filter, and one that lets through a hundredth of the library, so a search reads furthest to fill a page.
const FILTERS: [SeriesFilter; 2] = [
    SeriesFilter::NONE,
    SeriesFilter {
        finished: Inclusion::Only,
        ..SeriesFilter::NONE
    },
];

enum Read {
    FirstPage,
    PageAfter(Cursor),
    Count,
}

#[tokio::test]
#[expect(
    clippy::print_stderr,
    reason = "the gate logs the measured timings so each platform's margin under the budget shows on every run"
)]
#[ignore = "a timing budget means something only in an optimised build, so the gate runs it on its own in release"]
async fn searches_10_000_series_within_10_ms_at_p95() {
    let trial = SpeedTrial {
        measured: "a search of 10,000 series",
        sampling: Sampling::Repeated {
            samples: NonZeroUsize::new(SAMPLES).unwrap(),
            statistic: Statistic::Percentile95,
        },
        budget: TimingBudget::from_env(BUDGET),
    };
    let folder = ScratchFolder::new("search-speed");
    let database = Database::open(&library_config(&folder)).unwrap();
    add_generated_library(&database).await;

    let mut over_budget = Vec::new();
    for text in TEXTS {
        for filter in FILTERS {
            let search = SeriesSearch {
                text: SearchText::parse(text).unwrap().unwrap(),
                filter,
            };
            let outcome = trial
                .run(
                    async |_| Read::FirstPage,
                    async |next| {
                        *next = read(&database, &search, mem::replace(next, Read::Count)).await;
                    },
                )
                .await;
            eprintln!("{text:?} through {filter:?}: {outcome}");
            if !outcome.is_within_budget() {
                over_budget.push(format!("{text:?} through {filter:?}: {outcome}"));
            }
        }
    }

    assert_eq!(over_budget, Vec::<String>::new());
}

async fn add_generated_library(database: &Database) {
    add_generated_series(database, &BOOK_TITLES).await;
    database
        .write(|transaction| {
            transaction.execute(
                "INSERT INTO book_state (book_id, is_read)
                SELECT book.id, 1 FROM book JOIN series ON series.local_id = book.series_local_id
                WHERE series.added_at_ms % ?1 = 0",
                [EVERY_HUNDREDTH_FINISHED],
            )?;
            Ok(())
        })
        .await
        .unwrap();
}

async fn read(database: &Database, search: &SeriesSearch, step: Read) -> Read {
    let search = search.clone();
    match step {
        Read::FirstPage => page(database, search, None)
            .await
            .map_or(Read::Count, Read::PageAfter),
        Read::PageAfter(after) => {
            page(database, search, Some(after)).await;
            Read::Count
        }
        Read::Count => {
            database
                .read(move |connection| search_count(connection, &search))
                .await
                .unwrap();
            Read::FirstPage
        }
    }
}

async fn page(database: &Database, search: SeriesSearch, after: Option<Cursor>) -> Option<Cursor> {
    let request = PageRequest {
        after,
        size: PageSize::try_from(PAGE_SIZE).unwrap(),
    };
    database
        .read(move |connection| search_page(connection, &search, &request))
        .await
        .unwrap()
        .next
}
