mod support;

use std::time::{Duration, Instant};

use omnileaf_engine::{Clock, FileChanges, Library, RescanOutcome};
use omnileaf_testkit::{GENERATED_LIBRARY_NAME, GeneratedLibrary, write_generated_library};
use support::TempFolder;

const LIBRARY: GeneratedLibrary = GeneratedLibrary {
    series: 100,
    books_per_series: 10,
    pages_per_book: 24,
};
const BOOKS: u32 = LIBRARY.books();
const BUDGET: Duration = Duration::from_secs(3);
const UNCHANGED_RESCAN_BUDGET: Duration = Duration::from_millis(300);
const NOW_UNIX_MS: u64 = 1_790_000_000_000;

struct FixedClock;

impl Clock for FixedClock {
    fn now_unix_ms(&self) -> u64 {
        NOW_UNIX_MS
    }
}

#[tokio::test]
#[expect(
    clippy::print_stderr,
    reason = "the gate logs the measured time so each platform's margin under the budget shows on every run"
)]
#[ignore = "a timing budget means something only in an optimised build, so the gate runs it on its own in release"]
async fn scans_a_first_library_of_1_000_books_within_3_s() {
    let comics = TempFolder::new("scan-speed-comics")
        .with_files(&["Generated Library/.DS_Store", "Generated Library/notes.txt"]);
    write_generated_library(comics.path(), LIBRARY).unwrap();
    let home = TempFolder::new("scan-speed-home");
    let library = Library::open(home.path().to_path_buf(), FixedClock)
        .await
        .unwrap();

    let started = Instant::now();
    let scan = library
        .add_folder(comics.path().join(GENERATED_LIBRARY_NAME), |_| {})
        .await
        .unwrap();
    let elapsed = started.elapsed();

    eprintln!("first scan of {BOOKS} books: {elapsed:?}, budget {BUDGET:?}");
    assert_eq!(scan.books, BOOKS);
    assert!(
        elapsed <= BUDGET,
        "the first scan of {BOOKS} books took {elapsed:?}, over the {BUDGET:?} budget"
    );
}

#[tokio::test]
#[expect(
    clippy::print_stderr,
    reason = "the gate logs the measured time so each platform's margin under the budget shows on every run"
)]
#[ignore = "a timing budget means something only in an optimised build, so the gate runs it on its own in release"]
async fn rescans_an_unchanged_library_of_1_000_books_within_300_ms() {
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

    let started = Instant::now();
    let rescan = library.rescan_folder(folder, |_| {}).await.unwrap();
    let elapsed = started.elapsed();

    eprintln!("unchanged rescan of {BOOKS} books: {elapsed:?}, budget {UNCHANGED_RESCAN_BUDGET:?}");
    assert_eq!(
        rescan.outcome,
        RescanOutcome::Rescanned(FileChanges::default())
    );
    assert!(
        elapsed <= UNCHANGED_RESCAN_BUDGET,
        "the unchanged rescan of {BOOKS} books took {elapsed:?}, over the {UNCHANGED_RESCAN_BUDGET:?} budget"
    );
}
