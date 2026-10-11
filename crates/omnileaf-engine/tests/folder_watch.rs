#![cfg(not(any(target_os = "android", target_os = "ios")))]
#![expect(
    clippy::unwrap_used,
    reason = "each test watches its own generated folder in a scratch library, so a failed set-up should stop the test"
)]

#[expect(dead_code, reason = "these tests write whole books, never loose pages")]
mod books;
#[expect(
    dead_code,
    reason = "these tests read the library through its own interface, never its database"
)]
mod scanned;
mod support;

use std::{fs, time::Duration};

use books::write_book;
use omnileaf_engine::{AppFiles, FolderWatch, Library, LibraryFolders};
use scanned::Scanned;
use support::ScratchFolder;
use tokio::time::timeout;

const SERIES_01: &str = "Sample Series 01";
const SERIES_02: &str = "Sample Series 02";
const SERIES_03: &str = "Sample Series 03";
const DOTTED_SERIES: &str = "Sample Series Vol. 2";
const SHOWN_WITHIN: Duration = Duration::from_secs(3);
/// A folder that can't be watched is tried again a few seconds later, then rescanned once watched.
const RETRIED_FOLDER_SHOWN_WITHIN: Duration = Duration::from_secs(12);
/// A folder added while the watch runs is found at the watch's next look at the library's folders.
const ADDED_FOLDER_SHOWN_WITHIN: Duration = Duration::from_secs(5);

async fn series_titles(library: &Library) -> Vec<String> {
    library
        .series(None)
        .await
        .unwrap()
        .series
        .into_iter()
        .map(|series| series.title)
        .collect()
}

async fn comes_to_list(
    watch: FolderWatch<'_>,
    library: &Library,
    expected: &[&str],
    limit: Duration,
) -> bool {
    let mut changes = library.changes();
    let listed = async {
        while series_titles(library).await != expected {
            changes.next().await;
        }
    };
    tokio::select! {
        () = watch.rescan_on_change() => false,
        listed = timeout(limit, listed) => listed.is_ok(),
    }
}

fn app_files(scanned: &Scanned) -> AppFiles {
    AppFiles {
        library: LibraryFolders::from(scanned.home.path().to_path_buf()),
        folders: Vec::new(),
    }
}

async fn linked(name: &str) -> (Scanned, ScratchFolder) {
    let comics = ScratchFolder::new(name);
    write_book(&comics.path().join(SERIES_01).join("v01.cbz"), 1);
    write_book(&comics.path().join(SERIES_02).join("v01.cbz"), 2);
    let (scanned, _, _) = Scanned::folder(name, comics.path()).await;
    (scanned, comics)
}

#[tokio::test]
async fn lists_a_book_added_to_a_watched_folder_within_three_seconds() {
    let (scanned, comics) = linked("watch-added").await;
    let watch = scanned.library.watch_folders(&app_files(&scanned)).await;

    write_book(&comics.path().join(SERIES_03).join("v01.cbz"), 3);

    assert!(
        comes_to_list(
            watch,
            &scanned.library,
            &[SERIES_01, SERIES_02, SERIES_03],
            SHOWN_WITHIN
        )
        .await
    );
}

#[tokio::test]
async fn stops_listing_a_book_removed_from_a_watched_folder_within_three_seconds() {
    let (scanned, comics) = linked("watch-removed").await;
    let watch = scanned.library.watch_folders(&app_files(&scanned)).await;

    fs::remove_dir_all(comics.path().join(SERIES_02)).unwrap();

    assert!(comes_to_list(watch, &scanned.library, &[SERIES_01], SHOWN_WITHIN).await);
}

#[tokio::test]
async fn watches_a_folder_added_while_watching() {
    let (scanned, _comics) = linked("watch-following").await;
    let added = ScratchFolder::new("watch-following-added");
    let watch = scanned.library.watch_folders(&app_files(&scanned)).await;
    let watching = async {
        scanned
            .library
            .add_folder(added.path().to_path_buf(), |_| {})
            .await
            .unwrap();
        write_book(&added.path().join(SERIES_03).join("v01.cbz"), 3);
    };

    let ((), is_listed) = tokio::join!(watching, async {
        comes_to_list(
            watch,
            &scanned.library,
            &[SERIES_01, SERIES_02, SERIES_03],
            ADDED_FOLDER_SHOWN_WITHIN,
        )
        .await
    });

    assert!(is_listed);
}

#[tokio::test]
async fn stops_listing_a_series_folder_moved_out_with_a_dot_in_its_name() {
    let comics = ScratchFolder::new("watch-moved-out");
    let elsewhere = ScratchFolder::new("watch-moved-out-elsewhere");
    write_book(&comics.path().join(SERIES_01).join("v01.cbz"), 1);
    write_book(&comics.path().join(DOTTED_SERIES).join("v01.cbz"), 2);
    let (scanned, _, _) = Scanned::folder("watch-moved-out", comics.path()).await;
    let watch = scanned.library.watch_folders(&app_files(&scanned)).await;

    fs::rename(
        comics.path().join(DOTTED_SERIES),
        elsewhere.path().join(DOTTED_SERIES),
    )
    .unwrap();

    assert!(comes_to_list(watch, &scanned.library, &[SERIES_01], SHOWN_WITHIN).await);
}

#[tokio::test]
async fn watches_a_folder_missing_at_first_once_it_is_back() {
    let (scanned, comics) = linked("watch-missing").await;
    let parked = ScratchFolder::new("watch-missing-parked");
    let parked_at = parked.path().join("comics");
    fs::rename(comics.path(), &parked_at).unwrap();
    let watch = scanned.library.watch_folders(&app_files(&scanned)).await;

    fs::rename(&parked_at, comics.path()).unwrap();
    write_book(&comics.path().join(SERIES_03).join("v01.cbz"), 3);

    assert!(
        comes_to_list(
            watch,
            &scanned.library,
            &[SERIES_01, SERIES_02, SERIES_03],
            RETRIED_FOLDER_SHOWN_WITHIN,
        )
        .await
    );
}
