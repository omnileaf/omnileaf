#![expect(
    clippy::unwrap_used,
    reason = "the test builds its own scratch library, so a failed set-up should stop it"
)]

mod support;

use std::time::{Duration, Instant};

use omnileaf_db::{
    Database,
    catalog::{
        NewBook, NewSeries, PageRequest, PageSize, SeriesOrder, add_book, add_series, series_page,
    },
};
use omnileaf_sync_proto::{Fingerprint, ImageEntry};
use support::ScratchFolder;

const SERIES_COUNT: u32 = 10_000;
const PAGE_SIZE: u16 = 100;
const WALKS: usize = 3;
const BUDGET: Duration = Duration::from_millis(2);
const PERCENTILE: usize = 95;

#[tokio::test]
#[expect(
    clippy::print_stderr,
    reason = "the gate logs the measured timings so each platform's margin under the budget shows on every run"
)]
#[ignore = "a timing budget means something only in an optimised build, so the gate runs it on its own in release"]
async fn reads_each_title_page_of_10_000_series_within_2_ms_at_p95() {
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
        "title page of {PAGE_SIZE} from {SERIES_COUNT} series: median {median:?}, p95 {p95:?}, slowest {slowest:?} over {} pages, budget {BUDGET:?}",
        timings.len()
    );

    assert!(
        p95 <= BUDGET,
        "a title page took {p95:?} at p95 over {} pages, over the {BUDGET:?} budget",
        timings.len()
    );
}

async fn add_generated_series(database: &Database) {
    database
        .write(|transaction| {
            for number in 0..SERIES_COUNT {
                let name = format!("Sample Series {number:05}");
                let series = NewSeries::local(&name, i64::from(number)).unwrap();
                add_series(transaction, &series)?;
                let book = NewBook {
                    fingerprint: fingerprint(number),
                    series: series.id(),
                    title: "Volume 01".to_owned(),
                    added_at_ms: i64::from(number),
                };
                add_book(transaction, &book)?;
            }
            Ok(())
        })
        .await
        .unwrap();
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

fn fingerprint(number: u32) -> Fingerprint {
    let page = ImageEntry {
        crc32: number,
        size: u64::from(number),
    };
    Fingerprint::pmf1([page]).unwrap()
}
