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
use omnileaf_engine::{
    AppFiles, FolderWatch, FolderWatchSwitch, LIBRARY_CHANGES_GATHERED_FOR, Library,
    LibraryChanged, LibraryFolders, LibraryListing,
};
use scanned::Scanned;
use support::ScratchFolder;
use tokio::time::timeout;

const SERIES_01: &str = "Sample Series 01";
const SERIES_02: &str = "Sample Series 02";
const SERIES_03: &str = "Sample Series 03";
const DOTTED_SERIES: &str = "Sample Series Vol. 2";
const SHOWN_WITHIN: Duration = Duration::from_secs(3);
const STAYS_UNLISTED_FOR: Duration = SHOWN_WITHIN;
const WATCH_SET_UP_WITHIN: Duration = Duration::from_secs(5);
const SHOWN_ONCE_SWITCHED_ON_WITHIN: Duration = WATCH_SET_UP_WITHIN.saturating_add(SHOWN_WITHIN);
const RETRIED_FOLDER_SHOWN_WITHIN: Duration = Duration::from_secs(12);
const ADDED_FOLDER_SHOWN_WITHIN: Duration = Duration::from_secs(5);

async fn series_titles(library: &Library) -> Vec<String> {
    library
        .series(LibraryListing::default(), None)
        .await
        .unwrap()
        .series
        .into_iter()
        .map(|series| series.title)
        .collect()
}

async fn lists_within(library: &Library, expected: &[&str], limit: Duration) -> bool {
    let mut changes = library.changes();
    let listed = async {
        while series_titles(library).await != expected {
            changes.next().await;
        }
    };
    timeout(limit, listed).await.is_ok()
}

async fn while_watching<T>(watch: FolderWatch<'_>, body: impl Future<Output = T>) -> Option<T> {
    tokio::select! {
        biased;
        done = body => Some(done),
        () = watch.rescan_on_change() => None,
    }
}

async fn comes_to_list(
    watch: FolderWatch<'_>,
    library: &Library,
    expected: &[&str],
    limit: Duration,
) -> bool {
    while_watching(watch, lists_within(library, expected, limit)).await == Some(true)
}

fn switched_on() -> FolderWatchSwitch {
    let switch = FolderWatchSwitch::off();
    switch.turn(true);
    switch
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
    let watch = scanned
        .library
        .watch_folders(&app_files(&scanned), &switched_on())
        .await;

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
async fn tells_of_one_library_change_for_the_books_added_to_a_watched_folder() {
    let (scanned, comics) = linked("watch-told").await;
    let mut changes = scanned.library.changes();
    let watch = scanned
        .library
        .watch_folders(&app_files(&scanned), &switched_on())
        .await;

    let told = while_watching(watch, async {
        write_book(&comics.path().join(SERIES_03).join("v01.cbz"), 3);
        write_book(&comics.path().join(SERIES_03).join("v02.cbz"), 4);
        let told = timeout(SHOWN_WITHIN, changes.next()).await;
        let told_again = timeout(LIBRARY_CHANGES_GATHERED_FOR * 4, changes.next()).await;
        (told.ok().flatten(), told_again.is_ok())
    })
    .await;

    assert_eq!(told, Some((Some(LibraryChanged), false)));
}

#[tokio::test]
async fn tells_of_no_library_change_when_a_watched_folder_holds_nothing_new() {
    let (scanned, comics) = linked("watch-quiet").await;
    let mut changes = scanned.library.changes();
    let watch = scanned
        .library
        .watch_folders(&app_files(&scanned), &switched_on())
        .await;

    let told = while_watching(watch, async {
        fs::write(
            comics.path().join(SERIES_01).join("notes.txt"),
            "not a book",
        )
        .unwrap();
        timeout(STAYS_UNLISTED_FOR, changes.next()).await.is_ok()
    })
    .await;

    assert_eq!(told, Some(false));
}

#[tokio::test]
async fn stops_listing_a_book_removed_from_a_watched_folder_within_three_seconds() {
    let (scanned, comics) = linked("watch-removed").await;
    let watch = scanned
        .library
        .watch_folders(&app_files(&scanned), &switched_on())
        .await;

    fs::remove_dir_all(comics.path().join(SERIES_02)).unwrap();

    assert!(comes_to_list(watch, &scanned.library, &[SERIES_01], SHOWN_WITHIN).await);
}

#[tokio::test]
async fn watches_a_folder_added_while_watching() {
    let (scanned, _comics) = linked("watch-following").await;
    let added = ScratchFolder::new("watch-following-added");
    let watch = scanned
        .library
        .watch_folders(&app_files(&scanned), &switched_on())
        .await;
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
    let watch = scanned
        .library
        .watch_folders(&app_files(&scanned), &switched_on())
        .await;

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
    let watch = scanned
        .library
        .watch_folders(&app_files(&scanned), &switched_on())
        .await;

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

#[tokio::test]
async fn leaves_a_book_added_while_watching_is_off_unlisted() {
    let (scanned, comics) = linked("watch-off").await;
    let switch = switched_on();
    let watch = scanned
        .library
        .watch_folders(&app_files(&scanned), &switch)
        .await;

    let listed = while_watching(watch, async {
        switch.turn(false);
        write_book(&comics.path().join(SERIES_03).join("v01.cbz"), 3);
        lists_within(
            &scanned.library,
            &[SERIES_01, SERIES_02, SERIES_03],
            STAYS_UNLISTED_FOR,
        )
        .await
    })
    .await;

    assert_eq!(listed, Some(false));
}

#[tokio::test]
async fn lists_a_book_added_while_watching_was_off_once_it_is_on_again() {
    let (scanned, comics) = linked("watch-off-then-on").await;
    let switch = switched_on();
    let watch = scanned
        .library
        .watch_folders(&app_files(&scanned), &switch)
        .await;
    let all = [SERIES_01, SERIES_02, SERIES_03];

    let listed = while_watching(watch, async {
        switch.turn(false);
        write_book(&comics.path().join(SERIES_03).join("v01.cbz"), 3);
        let while_off = lists_within(&scanned.library, &all, STAYS_UNLISTED_FOR).await;
        switch.turn(true);
        let once_on = lists_within(&scanned.library, &all, SHOWN_ONCE_SWITCHED_ON_WITHIN).await;
        (while_off, once_on)
    })
    .await;

    assert_eq!(listed, Some((false, true)));
}

#[tokio::test]
async fn lists_a_book_added_before_watching_is_first_switched_on_once_it_is() {
    let (scanned, comics) = linked("watch-first-on").await;
    let switch = FolderWatchSwitch::off();
    let watch = scanned
        .library
        .watch_folders(&app_files(&scanned), &switch)
        .await;
    let all = [SERIES_01, SERIES_02, SERIES_03];

    let listed = while_watching(watch, async {
        write_book(&comics.path().join(SERIES_03).join("v01.cbz"), 3);
        let before_on = lists_within(&scanned.library, &all, STAYS_UNLISTED_FOR).await;
        switch.turn(true);
        let once_on = lists_within(&scanned.library, &all, SHOWN_ONCE_SWITCHED_ON_WITHIN).await;
        (before_on, once_on)
    })
    .await;

    assert_eq!(listed, Some((false, true)));
}
