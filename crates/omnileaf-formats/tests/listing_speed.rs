mod support;

use std::time::{Duration, Instant};

use omnileaf_formats::open_book;
use omnileaf_testkit::{Compression, PageShape, TimingBudget, cbz, page_png};
use support::{ScratchFolder, entry};

const SEED: u64 = 48;
const ENTRY_COUNT: u32 = 500;
const DISTINCT_PAGES: u32 = 10;
const RUNS: usize = 31;
const BUDGET: Duration = Duration::from_millis(3);

#[test]
#[expect(
    clippy::print_stderr,
    reason = "the gate logs the measured timings so each platform's margin under the budget shows on every run"
)]
#[ignore = "a timing budget means something only in an optimised build, so the gate runs it on its own in release"]
fn lists_a_500_entry_archive_within_3_ms() {
    let budget = TimingBudget::from_env(BUDGET);
    let scratch = ScratchFolder::new("listing-speed");
    let pages: Vec<Vec<u8>> = (0..DISTINCT_PAGES)
        .map(|index| page_png(SEED, index, PageShape::Portrait).unwrap())
        .collect();
    let entries: Vec<_> = (0..ENTRY_COUNT)
        .map(|index| {
            let bytes = pages[(index % DISTINCT_PAGES) as usize].clone();
            entry(&format!("{:03}.png", index + 1), bytes)
        })
        .collect();
    let path = scratch.write("book.cbz", &cbz(&entries, Compression::Stored).unwrap());

    let mut timings: Vec<Duration> = (0..RUNS)
        .map(|_| {
            let started = Instant::now();
            let book = open_book(&path).unwrap();
            let elapsed = started.elapsed();
            assert_eq!(book.pages().len(), ENTRY_COUNT as usize);
            elapsed
        })
        .collect();
    timings.sort_unstable();
    let median = timings[RUNS / 2];
    let slowest = timings[RUNS - 1];
    eprintln!(
        "listing {ENTRY_COUNT} entries: median {median:?}, slowest {slowest:?} over {RUNS} runs, {budget}"
    );

    assert!(
        budget.allows(median),
        "listing {ENTRY_COUNT} entries took {median:?} at the median of {RUNS} runs, over the {budget}"
    );
}
