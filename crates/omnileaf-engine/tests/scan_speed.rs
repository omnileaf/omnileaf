#![expect(
    clippy::unwrap_used,
    reason = "the tree of folders is built in a scratch folder, so a failed set-up should stop the test"
)]

mod support;
#[expect(
    dead_code,
    reason = "these tests never lose access to a tree, change its archives, count the files opened, wait for company or time out, nor read the sample library"
)]
mod tree_of_folder;

use std::time::Duration;

use omnileaf_engine::{
    AndroidTree, FileChanges, FileFate, Library, LibraryListing, RemovalTarget, RescanOutcome,
    RootLocator, TreeUri,
};
use omnileaf_testkit::{
    GENERATED_LIBRARY_NAME, GeneratedLibrary, Sampling, SpeedTrial, TimingBudget,
    write_generated_library,
};
use support::{FixedClock, ScratchFolder};
use tree_of_folder::{Opening, TreeOfFolder};

const LIBRARY: GeneratedLibrary = GeneratedLibrary {
    series: 100,
    books_per_series: 10,
    pages_per_book: 24,
};
const BOOKS: u32 = LIBRARY.books();
const BUDGET: Duration = Duration::from_secs(3);
const UNCHANGED_RESCAN_BUDGET: Duration = Duration::from_millis(300);
const REMOVED_SERIES: usize = 30;
const REMOVED_BOOKS: u32 = 300;
const REMOVED_RESCAN_BUDGET: Duration = Duration::from_millis(300);
const ONE_PAGE_LIBRARY: GeneratedLibrary = GeneratedLibrary {
    pages_per_book: 1,
    ..LIBRARY
};
const OPEN_LATENCY: Duration = Duration::from_millis(5);
const SLOW_OPENS_BUDGET: Duration = Duration::from_millis(2500);
const GENERATED_TREE: &str = "content://documents.test/tree/primary%3ADocuments%2FGenerated";
const INTERNAL_DOCUMENTS: &str = "Internal storage › Documents";

fn generated_tree() -> RootLocator {
    RootLocator::AndroidTree(
        AndroidTree::new(
            TreeUri::parse(GENERATED_TREE.to_owned()).unwrap(),
            GENERATED_LIBRARY_NAME.to_owned(),
            INTERNAL_DOCUMENTS.to_owned(),
        )
        .unwrap(),
    )
}

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
    let comics = ScratchFolder::new("scan-speed-comics");
    comics.write("Generated Library/.DS_Store", b"");
    comics.write("Generated Library/notes.txt", b"");
    write_generated_library(comics.path(), LIBRARY).unwrap();

    let outcome = trial
        .run(
            async |pass| {
                let home = ScratchFolder::new(&format!("scan-speed-home-{pass}"));
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
    let comics = ScratchFolder::new("rescan-speed-comics");
    write_generated_library(comics.path(), LIBRARY).unwrap();
    let home = ScratchFolder::new("rescan-speed-home");
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

#[tokio::test]
#[expect(
    clippy::print_stderr,
    reason = "the gate logs the measured time so each platform's margin under the budget shows on every run"
)]
#[ignore = "a timing budget means something only in an optimised build, so the gate runs it on its own in release"]
async fn rescans_1_000_books_with_300_removed_but_still_on_disk_within_300_ms() {
    let trial = SpeedTrial {
        measured: "the rescan of 1,000 books, 300 of them removed but still on disk",
        sampling: Sampling::Once,
        budget: TimingBudget::from_env(REMOVED_RESCAN_BUDGET),
    };
    let comics = ScratchFolder::new("removed-rescan-speed-comics");
    write_generated_library(comics.path(), LIBRARY).unwrap();
    let home = ScratchFolder::new("removed-rescan-speed-home");
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
    let removing: Vec<RemovalTarget> = library
        .series(LibraryListing::default(), None)
        .await
        .unwrap()
        .series
        .iter()
        .take(REMOVED_SERIES)
        .map(|series| RemovalTarget::Series { id: series.id })
        .collect();
    let removal = library
        .remove_from_library(&removing, FileFate::keep())
        .await
        .unwrap();
    assert_eq!(removal.removed_books, REMOVED_BOOKS);

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

#[tokio::test]
#[expect(
    clippy::print_stderr,
    reason = "the gate logs the measured time so each platform's margin under the budget shows on every run"
)]
#[ignore = "a timing budget means something only in an optimised build, so the gate runs it on its own in release"]
async fn scans_1_000_books_with_5_ms_opens_within_2_5_s() {
    let trial = SpeedTrial {
        measured: "the first scan of 1,000 books, each opened after 5 ms",
        sampling: Sampling::Once,
        budget: TimingBudget::from_env(SLOW_OPENS_BUDGET),
    };
    let tree = TreeOfFolder::generated(
        "slow-opens-scan-speed-comics",
        ONE_PAGE_LIBRARY,
        Opening::After(OPEN_LATENCY),
    );

    let outcome = trial
        .run(
            async |pass| {
                let home = ScratchFolder::new(&format!("slow-opens-scan-speed-home-{pass}"));
                let library = Library::open(home.path().to_path_buf(), FixedClock)
                    .await
                    .unwrap()
                    .reading_trees_with(tree.opener());
                (library, home)
            },
            async |(library, _home)| {
                let scan = library.add_folder(generated_tree(), |_| {}).await.unwrap();
                assert_eq!(scan.books, BOOKS);
            },
        )
        .await;

    eprintln!("{outcome}");
    assert!(outcome.is_within_budget(), "{outcome}");
}
