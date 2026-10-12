mod support;

use std::{num::NonZeroUsize, time::Duration};

use omnileaf_formats::open_book;
use omnileaf_testkit::{
    Packing, Sampling, SpeedTrial, Statistic, TimingBudget, cb7, incompressible_bytes,
};
use support::{ScratchFolder, entry};

const PAGE_COUNT: u32 = 100;
const PAGE_BYTES: usize = 512 * 1024;
const SCAN_LIKE_SYMBOLS: u8 = 240;
const RUNS: usize = 5;
const BUDGET: Duration = Duration::from_millis(300);

/// LZMA2 stores a chunk it can't shrink as is, so a page needs a JPEG's slight redundancy for its decoding to be measured at all.
fn scan_like_page(index: u32) -> Vec<u8> {
    incompressible_bytes(u64::from(index), PAGE_BYTES)
        .into_iter()
        .map(|byte| byte % SCAN_LIKE_SYMBOLS)
        .collect()
}

#[tokio::test]
#[expect(
    clippy::print_stderr,
    reason = "the gate logs the measured timings so each platform's margin under the budget shows on every run"
)]
#[ignore = "a timing budget means something only in an optimised build, so the gate runs it on its own in release"]
async fn shows_the_first_page_of_a_100_page_solid_cb7_within_300_ms() {
    let trial = SpeedTrial {
        measured: "opening a solid 100-page cb7 of 512 KB scan-like pages and reading its first page",
        sampling: Sampling::Repeated {
            samples: NonZeroUsize::new(RUNS).unwrap(),
            statistic: Statistic::Median,
        },
        budget: TimingBudget::from_env(BUDGET),
    };
    let scratch = ScratchFolder::new("cb7-speed");
    let entries: Vec<_> = (0..PAGE_COUNT)
        .map(|index| entry(&format!("{:03}.jpg", index + 1), scan_like_page(index)))
        .collect();
    let first_page = entries.first().unwrap().bytes.clone();
    let path = scratch.write("book.cb7", &cb7(&entries, Packing::Solid).unwrap());

    let outcome = trial
        .run(
            async |_| (),
            async |()| {
                let mut book = open_book(&path).unwrap();
                assert_eq!(book.pages().len(), PAGE_COUNT as usize);
                assert_eq!(book.read_page(0).unwrap(), first_page);
            },
        )
        .await;

    eprintln!("{outcome}");
    assert!(outcome.is_within_budget(), "{outcome}");
}
