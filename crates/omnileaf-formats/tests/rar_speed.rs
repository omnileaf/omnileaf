#![expect(
    clippy::unwrap_used,
    reason = "the gate builds its own book in a scratch folder, so a failed set-up should stop it"
)]

mod support;

use std::{num::NonZeroUsize, time::Duration};

use omnileaf_formats::open_book;
use omnileaf_testkit::{
    RarFormat, RarOptions, Sampling, SpeedTrial, Statistic, TimingBudget, cbr, incompressible_bytes,
};
use support::{ScratchFolder, entry};

const PAGE_COUNT: usize = 100;
const PAGE_BYTES: usize = 512 * 1024;
const RUNS: usize = 5;
const BUDGET: Duration = Duration::from_millis(300);

#[expect(
    clippy::print_stderr,
    reason = "the gate logs the measured timings so each platform's margin under the budget shows on every run"
)]
async fn first_page_within_budget(format: RarFormat, measured: &'static str, name: &str) {
    let trial = SpeedTrial {
        measured,
        sampling: Sampling::Repeated {
            samples: NonZeroUsize::new(RUNS).unwrap(),
            statistic: Statistic::Median,
        },
        budget: TimingBudget::from_env(BUDGET),
    };
    let scratch = ScratchFolder::new(name);
    let entries: Vec<_> = (0..PAGE_COUNT)
        .map(|index| {
            entry(
                &format!("{:03}.jpg", index + 1),
                incompressible_bytes(u64::try_from(index).unwrap(), PAGE_BYTES),
            )
        })
        .collect();
    let first_page = entries.first().unwrap().bytes.clone();
    let path = scratch.write("book.cbr", &cbr(&entries, &RarOptions::of(format)).unwrap());

    let outcome = trial
        .run(
            async |_| (),
            async |()| {
                let mut book = open_book(&path).unwrap();
                assert_eq!(book.pages().len(), PAGE_COUNT);
                assert_eq!(book.read_page(0).unwrap(), first_page);
            },
        )
        .await;

    eprintln!("{outcome}");
    assert!(outcome.is_within_budget(), "{outcome}");
}

#[tokio::test]
#[ignore = "a timing budget means something only in an optimised build, so the gate runs it on its own in release"]
async fn shows_the_first_page_of_a_100_page_rar5_within_300_ms() {
    first_page_within_budget(
        RarFormat::RAR5,
        "opening a 100-page rar 5 of 512 KB pages and reading its first page",
        "rar5-speed",
    )
    .await;
}

#[tokio::test]
#[ignore = "a timing budget means something only in an optimised build, so the gate runs it on its own in release"]
async fn shows_the_first_page_of_a_100_page_rar4_within_300_ms() {
    first_page_within_budget(
        RarFormat::RAR4,
        "opening a 100-page rar 4 of 512 KB pages and reading its first page",
        "rar4-speed",
    )
    .await;
}
