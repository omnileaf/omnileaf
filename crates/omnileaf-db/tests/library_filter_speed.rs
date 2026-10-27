#![expect(
    clippy::unwrap_used,
    reason = "the test builds its own scratch library, so a failed set-up should stop it"
)]

mod library_seed;
mod speed;
mod support;

use std::{num::NonZeroUsize, time::Duration};

use omnileaf_db::{
    Database,
    catalog::{
        Cursor, Inclusion, PageRequest, PageSize, SeriesFilter, SeriesListing, SeriesOrder,
        SeriesSort, series_count, series_page,
    },
};
use omnileaf_testkit::{Sampling, SpeedTrial, Statistic, TimingBudget};
use speed::add_generated_series;
use support::{ScratchFolder, library_config};

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
const EVERY_HUNDREDTH_FORGOTTEN: u32 = 100;
const FORGOTTEN_REMAINDER: u32 = 1;
const READ_LONG_AGO_MS: i64 = 1_000;
const READ_LATELY_MS: i64 = 2_000;
const SESSION_PAGE_COUNT: u32 = 24;
const PAGE_SIZE: u16 = 100;
const SAMPLES: usize = 40;
const BUDGET: Duration = Duration::from_millis(2);

const SORTS: [SeriesSort; 4] = [
    SeriesSort::ascending(SeriesOrder::Title),
    SeriesSort::descending(SeriesOrder::Title),
    SeriesSort::ascending(SeriesOrder::DateAdded),
    SeriesSort::descending(SeriesOrder::DateAdded),
];

/// No filter, and each condition alone either way, which takes in the filters matching a hundredth of the library and so reading furthest for a page.
const FILTERS: [SeriesFilter; 8] = [
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
    SeriesFilter {
        last_read_before_ms: Some(READ_LATELY_MS),
        ..SeriesFilter::NONE
    },
];

#[tokio::test]
#[expect(
    clippy::print_stderr,
    reason = "the gate logs the measured timings so each platform's margin under the budget shows on every run"
)]
#[ignore = "a timing budget means something only in an optimised build, so the gate runs it on its own in release"]
async fn reads_each_sorted_and_filtered_page_of_10_000_series_within_2_ms_at_p95() {
    let trial = trial_of("a sorted and filtered page of 100 from 10,000 series");
    let folder = ScratchFolder::new("filtered-page-speed");
    let database = Database::open(&library_config(&folder)).unwrap();
    add_generated_library(&database).await;

    let mut over_budget = Vec::new();
    for sort in SORTS {
        for filter in FILTERS {
            let listing = SeriesListing { sort, filter };
            let outcome = trial
                .run(
                    async |_| None,
                    async |after| *after = read_page(&database, listing, after.take()).await,
                )
                .await;
            eprintln!("{listing:?}: {outcome}");
            if !outcome.is_within_budget() {
                over_budget.push(format!("{listing:?}: {outcome}"));
            }
        }
    }

    assert_eq!(over_budget, Vec::<String>::new());
}

#[tokio::test]
#[expect(
    clippy::print_stderr,
    reason = "the gate logs the measured timings so each platform's margin under the budget shows on every run"
)]
#[ignore = "a timing budget means something only in an optimised build, so the gate runs it on its own in release"]
async fn counts_the_filtered_series_of_10_000_within_2_ms_at_p95() {
    let trial = trial_of("a filtered count of 10,000 series");
    let folder = ScratchFolder::new("filtered-count-speed");
    let database = Database::open(&library_config(&folder)).unwrap();
    add_generated_library(&database).await;

    let mut over_budget = Vec::new();
    for filter in FILTERS {
        let outcome = trial
            .run(async |_| (), async |()| count(&database, filter).await)
            .await;
        eprintln!("{filter:?}: {outcome}");
        if !outcome.is_within_budget() {
            over_budget.push(format!("{filter:?}: {outcome}"));
        }
    }

    assert_eq!(over_budget, Vec::<String>::new());
}

fn trial_of(measured: &'static str) -> SpeedTrial {
    SpeedTrial {
        measured,
        sampling: Sampling::Repeated {
            samples: NonZeroUsize::new(SAMPLES).unwrap(),
            statistic: Statistic::Percentile95,
        },
        budget: TimingBudget::from_env(BUDGET),
    }
}

async fn add_generated_library(database: &Database) {
    add_generated_series(database, &BOOK_TITLES).await;
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
            transaction.execute(
                "INSERT INTO reading_session (
                    book_id, started_at_ms, ended_at_ms, utc_offset_minutes, page, page_count
                )
                SELECT book.id, ended_at_ms, ended_at_ms, 0, 0, ?1
                FROM (
                    SELECT book.id, CASE WHEN series.added_at_ms % ?2 = ?3 THEN ?4 ELSE ?5 END
                        AS ended_at_ms
                    FROM book JOIN series ON series.local_id = book.series_local_id
                    WHERE book.title = ?6
                ) AS book",
                (
                    SESSION_PAGE_COUNT,
                    EVERY_HUNDREDTH_FORGOTTEN,
                    FORGOTTEN_REMAINDER,
                    READ_LONG_AGO_MS,
                    READ_LATELY_MS,
                    BOOK_TITLES[0],
                ),
            )?;
            Ok(())
        })
        .await
        .unwrap();
}

async fn read_page(
    database: &Database,
    listing: SeriesListing,
    after: Option<Cursor>,
) -> Option<Cursor> {
    let request = PageRequest {
        after,
        size: PageSize::try_from(PAGE_SIZE).unwrap(),
    };
    database
        .read(move |connection| series_page(connection, &listing, &request))
        .await
        .unwrap()
        .next
}

async fn count(database: &Database, filter: SeriesFilter) {
    database
        .read(move |connection| series_count(connection, &filter))
        .await
        .unwrap();
}
