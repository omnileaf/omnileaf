#![expect(
    clippy::unwrap_used,
    reason = "the test builds its own scratch library, so a failed set-up should stop it"
)]

mod library_seed;
mod support;

use std::{num::NonZeroUsize, time::Duration};

use library_seed::{SeriesSeed, seed_library};
use omnileaf_db::{
    Database,
    catalog::{Cursor, PageRequest, PageSize, SeriesOrder, series_page},
};
use omnileaf_testkit::{Sampling, SpeedTrial, Statistic, TimingBudget};
use support::ScratchFolder;

const SERIES_COUNT: u32 = 10_000;
const PAGE_SIZE: u16 = 100;
const PAGES: usize = (SERIES_COUNT / PAGE_SIZE as u32) as usize;
const BUDGET: Duration = Duration::from_millis(2);

#[tokio::test]
#[expect(
    clippy::print_stderr,
    reason = "the gate logs the measured timings so each platform's margin under the budget shows on every run"
)]
#[ignore = "a timing budget means something only in an optimised build, so the gate runs it on its own in release"]
async fn reads_each_title_page_of_10_000_series_within_2_ms_at_p95() {
    let trial = SpeedTrial {
        measured: "a title page of 100 from 10,000 series",
        sampling: Sampling::Repeated {
            samples: NonZeroUsize::new(PAGES).unwrap(),
            statistic: Statistic::Percentile95,
        },
        budget: TimingBudget::from_env(BUDGET),
    };
    let folder = ScratchFolder::new("title-page-speed");
    let database = Database::open(&folder.config()).unwrap();
    add_generated_series(&database).await;

    let outcome = trial
        .run(
            async |_| None,
            async |after| *after = read_title_page(&database, after.take()).await,
        )
        .await;

    eprintln!("{outcome}");
    assert!(outcome.is_within_budget(), "{outcome}");
}

async fn add_generated_series(database: &Database) {
    let names: Vec<(String, i64)> = (0..SERIES_COUNT)
        .map(|number| (format!("Sample Series {number:05}"), i64::from(number)))
        .collect();
    let series: Vec<SeriesSeed<'_>> = names
        .iter()
        .map(|(name, added_at_ms)| SeriesSeed {
            added_at_ms: *added_at_ms,
            ..SeriesSeed::named(name.as_str())
        })
        .collect();
    seed_library(database, &series).await;
}

/// Reads the full title page after `after`, waiting for a reader included, and returns the cursor to the next one.
async fn read_title_page(database: &Database, after: Option<Cursor>) -> Option<Cursor> {
    let request = PageRequest {
        after,
        size: PageSize::try_from(PAGE_SIZE).unwrap(),
    };
    let page = database
        .read(move |connection| series_page(connection, SeriesOrder::Title, &request))
        .await
        .unwrap();
    assert_eq!(page.items.len(), usize::from(PAGE_SIZE));
    page.next
}
