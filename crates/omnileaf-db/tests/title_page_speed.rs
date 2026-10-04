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
    catalog::{PageRequest, PageSize, SeriesOrder, series_page},
};
use omnileaf_testkit::TimingBudget;
use support::ScratchFolder;

const SERIES_COUNT: u32 = 10_000;
const PAGE_SIZE: u16 = 100;
const WALKS: usize = 3;
const BUDGET: Duration = Duration::from_millis(2);
const PERCENTILE: usize = 95;
const ONE_BOOK: &[&str] = &["Volume 01"];

#[tokio::test]
#[expect(
    clippy::print_stderr,
    reason = "the gate logs the measured timings so each platform's margin under the budget shows on every run"
)]
#[ignore = "a timing budget means something only in an optimised build, so the gate runs it on its own in release"]
async fn reads_each_title_page_of_10_000_series_within_2_ms_at_p95() {
    let budget = TimingBudget::from_env(BUDGET);
    let folder = ScratchFolder::new("title-page-speed");
    let database = Database::open(&folder.config()).unwrap();
    add_generated_series(&database).await;
    walk_title_pages(&database).await;

    let mut timings: Vec<Duration> = Vec::new();
    for _ in 0..WALKS {
        timings.extend(walk_title_pages(&database).await);
    }
    timings.sort_unstable();
    let p95 = timings[timings.len() * PERCENTILE / 100 - 1];
    let median = timings[timings.len() / 2];
    let slowest = timings[timings.len() - 1];
    eprintln!(
        "title page of {PAGE_SIZE} from {SERIES_COUNT} series: median {median:?}, p95 {p95:?}, slowest {slowest:?} over {} pages, {budget}",
        timings.len()
    );

    assert!(
        budget.allows(p95),
        "a title page took {p95:?} at p95 over {} pages, over the {budget}",
        timings.len()
    );
}

async fn add_generated_series(database: &Database) {
    let names: Vec<(String, i64)> = (0..SERIES_COUNT)
        .map(|number| (format!("Sample Series {number:05}"), i64::from(number)))
        .collect();
    let series: Vec<SeriesSeed<'_>> = names
        .iter()
        .map(|(name, added_at_ms)| (name.as_str(), *added_at_ms, ONE_BOOK))
        .collect();
    seed_library(database, &series).await;
}

/// Times each page from the caller's side, waiting for a reader included.
async fn walk_title_pages(database: &Database) -> Vec<Duration> {
    let mut timings = Vec::new();
    let mut after = None;
    loop {
        let request = PageRequest {
            after,
            size: PageSize::try_from(PAGE_SIZE).unwrap(),
        };
        let started = Instant::now();
        let page = database
            .read(move |connection| series_page(connection, SeriesOrder::Title, &request))
            .await
            .unwrap();
        timings.push(started.elapsed());
        assert_eq!(page.items.len(), usize::from(PAGE_SIZE));
        after = page.next;
        if after.is_none() {
            return timings;
        }
    }
}
