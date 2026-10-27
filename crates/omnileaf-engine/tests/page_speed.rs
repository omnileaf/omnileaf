#[expect(
    dead_code,
    reason = "this test needs scratch folders but none of the files support can put in them"
)]
mod support;
mod unopened_books;

use std::{num::NonZeroUsize, time::Duration};

use omnileaf_engine::Resource;
use omnileaf_testkit::{Sampling, SpeedTrial, Statistic, TimingBudget, subsampled_scan_jpeg};
use support::ScratchFolder;
use unopened_books::{BOOKS, ColdRouter, UnopenedBooks, write_scanned_library};

const FOLDER: &str = "Scanned Library";
const BUDGET: Duration = Duration::from_millis(150);

#[tokio::test]
#[expect(
    clippy::print_stderr,
    reason = "the gate logs the measured timings so each platform's margin under the budget shows on every run"
)]
#[ignore = "a timing budget means something only in an optimised build, so the gate runs it on its own in release"]
async fn opens_a_book_never_opened_before_to_its_first_page_within_150_ms_at_p95() {
    let trial = SpeedTrial {
        measured: "the first page of a book of 30 1800x2700 4:2:0 JPEG scans never opened before, the sizes of the pages around it read on the way and the rest left for later",
        sampling: Sampling::Repeated {
            samples: NonZeroUsize::new(usize::try_from(BOOKS).unwrap()).unwrap(),
            statistic: Statistic::Percentile95,
        },
        budget: TimingBudget::from_env(BUDGET),
    };
    let comics = ScratchFolder::new("page-speed-comics");
    let folder = comics.path().join(FOLDER);
    write_scanned_library(&folder, subsampled_scan_jpeg);

    let outcome = trial
        .run(
            async |pass| {
                (
                    UnopenedBooks::of(&folder, &pass.to_string()).await,
                    ColdRouter::open(),
                )
            },
            async |(unopened, cold)| {
                let opened = unopened.open_next(&cold.router).await;
                let first = unopened.serve(&cold.router, opened.pages[0].path).await;
                assert!(matches!(first, Resource::Immutable { .. }));
            },
        )
        .await;

    eprintln!("{outcome}");
    assert!(outcome.is_within_budget(), "{outcome}");
}
