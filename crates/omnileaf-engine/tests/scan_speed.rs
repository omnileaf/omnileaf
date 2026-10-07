mod support;

use std::time::Duration;

use omnileaf_engine::{FileChanges, Library, RescanOutcome};
use omnileaf_testkit::{
    GENERATED_LIBRARY_NAME, GeneratedLibrary, Sampling, SpeedTrial, TimingBudget,
    write_generated_library,
};
use support::{FixedClock, TempFolder};

const LIBRARY: GeneratedLibrary = GeneratedLibrary {
    series: 100,
    books_per_series: 10,
    pages_per_book: 24,
};
const BOOKS: u32 = LIBRARY.books();
const BUDGET: Duration = Duration::from_secs(3);
const UNCHANGED_RESCAN_BUDGET: Duration = Duration::from_millis(300);

#[tokio::test]
#[expect(
    clippy::print_stderr,
    reason = "the gate logs the measured time so each platform's margin under the budget shows on every run"
)]
#[ignore = "a timing budget means something only in an optimised build, so the gate runs it on its own in release"]
async fn scans_a_first_library_of_1_000_books_within_3_s() {
    let trial = SpeedTrial {
        measured: "the first scan of 1,000 books",
        sampling: Sampling::Once,
        budget: TimingBudget::from_env(BUDGET),
    };
    let comics = TempFolder::new("scan-speed-comics")
        .with_files(&["Generated Library/.DS_Store", "Generated Library/notes.txt"]);
    write_generated_library(comics.path(), LIBRARY).unwrap();

    let outcome = trial
        .run(
            async |pass| {
                let home = TempFolder::new(&format!("scan-speed-home-{pass}"));
                let library = Library::open(home.path().to_path_buf(), FixedClock)
                    .await
                    .unwrap();
                (library, home)
            },
            async |(library, _home)| {
                let scan = library
                    .add_folder(comics.path().join(GENERATED_LIBRARY_NAME), |_| {})
                    .await
                    .unwrap();
                assert_eq!(scan.books, BOOKS);
            },
        )
        .await;

    eprintln!("{outcome}");
    assert!(outcome.is_within_budget(), "{outcome}");
}

#[tokio::test]
#[expect(
    clippy::print_stderr,
    reason = "the gate logs the measured time so each platform's margin under the budget shows on every run"
)]
#[ignore = "a timing budget means something only in an optimised build, so the gate runs it on its own in release"]
async fn rescans_an_unchanged_library_of_1_000_books_within_300_ms() {
    let trial = SpeedTrial {
        measured: "the unchanged rescan of 1,000 books",
        sampling: Sampling::Once,
        budget: TimingBudget::from_env(UNCHANGED_RESCAN_BUDGET),
    };
    let comics = TempFolder::new("rescan-speed-comics");
    write_generated_library(comics.path(), LIBRARY).unwrap();
    let home = TempFolder::new("rescan-speed-home");
    let library = Library::open(home.path().to_path_buf(), FixedClock)
        .await
        .unwrap();
    library
        .add_folder(comics.path().join(GENERATED_LIBRARY_NAME), |_| {})
        .await
        .unwrap();
    let folder = library
        .folders(None)
        .await
        .unwrap()
        .folders
        .last()
        .unwrap()
        .id;

    let outcome = trial
        .run(
            async |_| (),
            async |()| {
                let rescan = library.rescan_folder(folder, |_| {}).await.unwrap();
                assert_eq!(
                    rescan.outcome,
                    RescanOutcome::Rescanned(FileChanges::default())
                );
            },
        )
        .await;

    eprintln!("{outcome}");
    assert!(outcome.is_within_budget(), "{outcome}");
}
