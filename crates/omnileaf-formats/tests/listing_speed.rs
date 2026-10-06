mod support;

use std::{num::NonZeroUsize, time::Duration};

use omnileaf_formats::open_book;
use omnileaf_testkit::{
    Compression, PageShape, Sampling, SpeedTrial, Statistic, TimingBudget, cbz, page_png,
};
use support::{ScratchFolder, entry};

const SEED: u64 = 48;
const ENTRY_COUNT: u32 = 500;
const DISTINCT_PAGES: u32 = 10;
const RUNS: usize = 31;
const BUDGET: Duration = Duration::from_millis(3);

#[tokio::test]
#[expect(
    clippy::print_stderr,
    reason = "the gate logs the measured timings so each platform's margin under the budget shows on every run"
)]
#[ignore = "a timing budget means something only in an optimised build, so the gate runs it on its own in release"]
async fn lists_a_500_entry_archive_within_3_ms() {
    let trial = SpeedTrial {
        measured: "listing a 500-entry archive",
        sampling: Sampling::Repeated {
            samples: NonZeroUsize::new(RUNS).unwrap(),
            statistic: Statistic::Median,
        },
        budget: TimingBudget::from_env(BUDGET),
    };
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

    let outcome = trial
        .run(
            async |_| (),
            async |()| {
                let book = open_book(&path).unwrap();
                assert_eq!(book.pages().len(), ENTRY_COUNT as usize);
            },
        )
        .await;

    eprintln!("{outcome}");
    assert!(outcome.is_within_budget(), "{outcome}");
}
