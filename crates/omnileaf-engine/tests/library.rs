#![expect(
    clippy::unwrap_used,
    reason = "each test opens its own library in a scratch folder, so a failed set-up should stop the test"
)]

mod support;

use std::{
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};

use omnileaf_engine::{
    AppleBookmark, Changed, CoversPerRow, DesktopCoversPerRow, FolderId, FolderKind, Library,
    LibraryDisplay, LibraryError, LibraryFolder, LibraryView, OnCovers, PhoneCoversPerRow,
    ResolvedBookmark, RootLocator, ScanProgress, TabletCoversPerRow,
};
use omnileaf_testkit::{SAMPLE_LIBRARY_NAME, write_sample_library};
use support::{FixedClock, ScratchFolder};

const MORE_FOLDERS_THAN_A_PAGE_HOLDS: usize = 120;
const PICKED_BOOKMARK: &[u8] = b"bookmark picked in Files";
const REFRESHED_BOOKMARK: &[u8] = b"bookmark made again after a move";

#[derive(Debug, PartialEq, Eq)]
struct DriveNotConnected;

fn bookmarked(path: PathBuf, bookmark: &[u8]) -> RootLocator {
    RootLocator::AppleBookmark {
        path,
        bookmark: AppleBookmark::new(bookmark.to_vec()),
    }
}

async fn bookmarks_asked_for(library: &Library, path: &Path) -> Vec<AppleBookmark> {
    let asked = Arc::new(Mutex::new(Vec::new()));
    let noted = Arc::clone(&asked);
    let path = path.to_path_buf();
    library
        .restore_folder_access(move |bookmark| {
            noted.lock().unwrap().push(bookmark.clone());
            Ok::<_, DriveNotConnected>(ResolvedBookmark {
                path: path.clone(),
                refreshed: None,
            })
        })
        .await
        .unwrap();
    asked.lock().unwrap().clone()
}

async fn moved_to(
    library: &Library,
    path: &Path,
    refreshed: &[u8],
) -> Vec<(FolderId, DriveNotConnected)> {
    let resolved = ResolvedBookmark {
        path: path.to_path_buf(),
        refreshed: Some(AppleBookmark::new(refreshed.to_vec())),
    };
    library
        .restore_folder_access(move |_| Ok(resolved.clone()))
        .await
        .unwrap()
}

async fn open(home: &Path) -> Library {
    Library::open(home.to_path_buf(), FixedClock).await.unwrap()
}

async fn all_folders(library: &Library) -> Vec<LibraryFolder> {
    let mut folders = Vec::new();
    let mut after = None;
    loop {
        let page = library.folders(after).await.unwrap();
        folders.extend(page.folders);
        match page.next {
            Some(next) => after = Some(next),
            None => return folders,
        }
    }
}

async fn folder_named(library: &Library, name: &str) -> LibraryFolder {
    all_folders(library)
        .await
        .into_iter()
        .find(|folder| folder.name == name)
        .unwrap()
}

fn names_the_folder(outcome: &Result<(), LibraryError>, id: FolderId) -> bool {
    outcome
        .as_ref()
        .is_err_and(|error| error.to_string().contains(&format!("folder {id}")))
}

fn kinds_and_names(folders: &[LibraryFolder]) -> Vec<(FolderKind, &str)> {
    folders
        .iter()
        .map(|folder| (folder.kind, folder.name.as_str()))
        .collect()
}

#[tokio::test]
async fn lists_the_home_folder_it_opened_in() {
    let home = ScratchFolder::new("library-home");
    home.write("Omnileaf/.keep", b"");
    let home_folder = home.path().join("Omnileaf");

    let library = open(&home_folder).await;

    let folders = all_folders(&library).await;
    assert_eq!(kinds_and_names(&folders), [(FolderKind::Home, "Omnileaf")]);
    assert_eq!(
        folders.first().map(|folder| folder.location.clone()),
        Some(home_folder.display().to_string())
    );
}

#[tokio::test]
async fn adds_a_folder_and_scans_the_books_in_it() {
    let home = ScratchFolder::new("library-add-home");
    let comics = ScratchFolder::new("library-add-comics");
    write_sample_library(comics.path()).unwrap();
    let library = open(home.path()).await;
    let mut progress = Vec::new();

    let scan = library
        .add_folder(comics.path().join(SAMPLE_LIBRARY_NAME), |step| {
            progress.push(step);
        })
        .await
        .unwrap();

    assert_eq!((scan.series, scan.books), (3, 7));
    assert_eq!(
        progress.last(),
        Some(&ScanProgress::Reading {
            scanned: 7,
            total: 7
        })
    );
    assert_eq!(
        kinds_and_names(&all_folders(&library).await),
        [
            (FolderKind::Home, "library-add-home"),
            (FolderKind::Linked, SAMPLE_LIBRARY_NAME)
        ]
    );
}

#[tokio::test]
async fn adds_a_bookmarked_folder_and_scans_the_books_in_it() {
    let home = ScratchFolder::new("library-bookmarked-home");
    let comics = ScratchFolder::new("library-bookmarked-comics");
    write_sample_library(comics.path()).unwrap();
    let library = open(home.path()).await;
    let picked = bookmarked(comics.path().join(SAMPLE_LIBRARY_NAME), PICKED_BOOKMARK);

    let scan = library.add_folder(picked, |_| {}).await.unwrap();

    assert_eq!((scan.series, scan.books), (3, 7));
    assert_eq!(
        kinds_and_names(&all_folders(&library).await),
        [
            (FolderKind::Home, "library-bookmarked-home"),
            (FolderKind::Linked, SAMPLE_LIBRARY_NAME)
        ]
    );
}

#[tokio::test]
async fn opens_each_bookmarked_folder_through_its_bookmark() {
    let home = ScratchFolder::new("library-restore-home");
    let comics = ScratchFolder::new("Bookmarked Comics");
    let library = open(home.path()).await;
    library
        .add_folder(
            bookmarked(comics.path().to_path_buf(), PICKED_BOOKMARK),
            |_| {},
        )
        .await
        .unwrap();

    let asked = bookmarks_asked_for(&library, comics.path()).await;

    assert_eq!(asked, [AppleBookmark::new(PICKED_BOOKMARK.to_vec())]);
    assert_eq!(
        folder_named(&library, "Bookmarked Comics").await.location,
        comics.path().display().to_string()
    );
}

#[tokio::test]
async fn follows_a_bookmarked_folder_that_moved_and_keeps_its_new_bookmark() {
    let home = ScratchFolder::new("library-restore-moved-home");
    let parent = ScratchFolder::new("library-restore-moved");
    let before = parent.path().join("Before");
    let after = parent.path().join("After");
    std::fs::create_dir(&before).unwrap();
    let library = open(home.path()).await;
    library
        .add_folder(bookmarked(before.clone(), PICKED_BOOKMARK), |_| {})
        .await
        .unwrap();
    std::fs::rename(&before, &after).unwrap();

    let failed = moved_to(&library, &after, REFRESHED_BOOKMARK).await;

    assert!(failed.is_empty());
    assert_eq!(
        folder_named(&library, "After").await.location,
        after.display().to_string()
    );
    assert_eq!(
        bookmarks_asked_for(&library, &after).await,
        [AppleBookmark::new(REFRESHED_BOOKMARK.to_vec())]
    );
}

#[tokio::test]
async fn leaves_a_bookmarked_folder_in_place_when_another_library_folder_is_where_it_moved() {
    let home = ScratchFolder::new("library-restore-taken-home");
    let comics = ScratchFolder::new("Bookmarked Taken");
    let manga = ScratchFolder::new("Already Linked");
    let library = open(home.path()).await;
    library
        .add_folder(manga.path().to_path_buf(), |_| {})
        .await
        .unwrap();
    library
        .add_folder(
            bookmarked(comics.path().to_path_buf(), PICKED_BOOKMARK),
            |_| {},
        )
        .await
        .unwrap();

    let failed = moved_to(&library, manga.path(), REFRESHED_BOOKMARK).await;

    assert!(failed.is_empty());
    assert_eq!(
        folder_named(&library, "Bookmarked Taken").await.location,
        comics.path().display().to_string()
    );
    assert_eq!(
        bookmarks_asked_for(&library, comics.path()).await,
        [AppleBookmark::new(REFRESHED_BOOKMARK.to_vec())]
    );
}

#[tokio::test]
async fn moves_a_bookmarked_folder_into_the_place_another_one_just_left() {
    let home = ScratchFolder::new("library-restore-swap-home");
    let parent = ScratchFolder::new("library-restore-swap");
    let newer = parent.path().join("Comics new");
    let current = parent.path().join("Comics");
    let older = parent.path().join("Comics old");
    std::fs::create_dir(&newer).unwrap();
    std::fs::create_dir(&current).unwrap();
    let library = open(home.path()).await;
    library
        .add_folder(bookmarked(newer.clone(), b"newer"), |_| {})
        .await
        .unwrap();
    library
        .add_folder(bookmarked(current.clone(), b"current"), |_| {})
        .await
        .unwrap();
    std::fs::rename(&current, &older).unwrap();
    std::fs::rename(&newer, &current).unwrap();
    let renamed: [(&[u8], PathBuf); 2] = [(b"newer", current.clone()), (b"current", older.clone())];

    library
        .restore_folder_access(move |bookmark| {
            renamed
                .iter()
                .find(|(was, _)| bookmark.as_bytes() == *was)
                .map(|(_, now)| ResolvedBookmark {
                    path: now.clone(),
                    refreshed: None,
                })
                .ok_or(DriveNotConnected)
        })
        .await
        .unwrap();

    assert_eq!(
        all_folders(&library)
            .await
            .iter()
            .map(|folder| folder.location.clone())
            .collect::<Vec<_>>(),
        [home.path(), &current, &older].map(|path| path.display().to_string())
    );
}

#[tokio::test]
async fn reads_a_bookmarked_folder_as_available_once_its_bookmark_opens_again() {
    let home = ScratchFolder::new("library-restore-again-home");
    let comics = ScratchFolder::new("Back Again");
    let library = open(home.path()).await;
    library
        .add_folder(
            bookmarked(comics.path().to_path_buf(), PICKED_BOOKMARK),
            |_| {},
        )
        .await
        .unwrap();
    library
        .restore_folder_access(|_| Err::<ResolvedBookmark, _>(DriveNotConnected))
        .await
        .unwrap();

    bookmarks_asked_for(&library, comics.path()).await;

    assert!(folder_named(&library, "Back Again").await.is_available);
}

#[tokio::test]
async fn keeps_a_bookmarked_folder_and_its_books_when_its_bookmark_wont_open() {
    let home = ScratchFolder::new("library-restore-failed-home");
    let comics = ScratchFolder::new("library-restore-failed-comics");
    write_sample_library(comics.path()).unwrap();
    let library = open(home.path()).await;
    library
        .add_folder(
            bookmarked(comics.path().join(SAMPLE_LIBRARY_NAME), PICKED_BOOKMARK),
            |_| {},
        )
        .await
        .unwrap();
    let linked = folder_named(&library, SAMPLE_LIBRARY_NAME).await;

    let failed = library
        .restore_folder_access(|_| Err::<ResolvedBookmark, _>(DriveNotConnected))
        .await
        .unwrap();

    assert_eq!(failed, [(linked.id, DriveNotConnected)]);
    assert_eq!(
        folder_named(&library, SAMPLE_LIBRARY_NAME).await,
        LibraryFolder {
            is_available: false,
            ..linked
        }
    );
    assert_eq!(library.series_count().await.unwrap(), 3);
}

#[tokio::test]
async fn keeps_the_newer_bookmark_of_a_folder_picked_again() {
    let home = ScratchFolder::new("library-picked-again-home");
    let comics = ScratchFolder::new("Picked Again");
    let library = open(home.path()).await;
    library
        .add_folder(
            bookmarked(comics.path().to_path_buf(), PICKED_BOOKMARK),
            |_| {},
        )
        .await
        .unwrap();

    library
        .add_folder(
            bookmarked(comics.path().to_path_buf(), REFRESHED_BOOKMARK),
            |_| {},
        )
        .await
        .unwrap();

    assert_eq!(
        bookmarks_asked_for(&library, comics.path()).await,
        [AppleBookmark::new(REFRESHED_BOOKMARK.to_vec())]
    );
}

#[tokio::test]
async fn remembers_its_folders_after_a_restart() {
    let home = ScratchFolder::new("library-restart-home");
    let comics = ScratchFolder::new("Sample Comics");
    let library = open(home.path()).await;
    library
        .add_folder(comics.path().to_path_buf(), |_| {})
        .await
        .unwrap();
    drop(library);

    let reopened = open(home.path()).await;

    assert_eq!(
        kinds_and_names(&all_folders(&reopened).await),
        [
            (FolderKind::Home, "library-restart-home"),
            (FolderKind::Linked, "Sample Comics")
        ]
    );
}

#[tokio::test]
async fn leaves_out_a_folder_it_cannot_read() {
    let home = ScratchFolder::new("library-unreadable-home");
    let library = open(home.path()).await;

    let outcome = library
        .add_folder(home.path().join("not-there"), |_| {})
        .await;

    assert!(matches!(
        outcome,
        Err(LibraryError::FolderUnreadable { .. })
    ));
    assert_eq!(
        kinds_and_names(&all_folders(&library).await),
        [(FolderKind::Home, "library-unreadable-home")]
    );
}

#[tokio::test]
async fn forgets_a_removed_folder_and_leaves_its_files() {
    let home = ScratchFolder::new("library-remove-home");
    let comics = ScratchFolder::new("Removed Comics");
    comics.write("one.cbz", b"");
    let library = open(home.path()).await;
    library
        .add_folder(comics.path().to_path_buf(), |_| {})
        .await
        .unwrap();
    let linked = folder_named(&library, "Removed Comics").await;

    library.remove_folder(linked.id).await.unwrap();

    assert_eq!(
        kinds_and_names(&all_folders(&library).await),
        [(FolderKind::Home, "library-remove-home")]
    );
    assert!(comics.path().join("one.cbz").is_file());
}

#[tokio::test]
async fn keeps_the_home_folder() {
    let home = ScratchFolder::new("library-keep-home");
    let library = open(home.path()).await;
    let home_folder = folder_named(&library, "library-keep-home").await;

    let outcome = library.remove_folder(home_folder.id).await;

    assert!(matches!(outcome, Err(LibraryError::HomeFolderKept { id }) if id == home_folder.id));
    assert!(names_the_folder(&outcome, home_folder.id));
}

#[tokio::test]
async fn reports_a_folder_already_removed() {
    let home = ScratchFolder::new("library-removed-twice-home");
    let comics = ScratchFolder::new("Removed Twice");
    let library = open(home.path()).await;
    library
        .add_folder(comics.path().to_path_buf(), |_| {})
        .await
        .unwrap();
    let linked = folder_named(&library, "Removed Twice").await;
    library.remove_folder(linked.id).await.unwrap();

    let outcome = library.remove_folder(linked.id).await;

    assert!(matches!(outcome, Err(LibraryError::FolderNotFound { id }) if id == linked.id));
    assert!(names_the_folder(&outcome, linked.id));
}

#[tokio::test]
async fn takes_back_the_folder_id_it_gave_the_interface() {
    let home = ScratchFolder::new("library-id-home");
    let library = open(home.path()).await;
    let home_folder = folder_named(&library, "library-id-home").await;
    let sent = serde_json::to_value(&home_folder).unwrap();

    let returned: FolderId = serde_json::from_value(sent["id"].clone()).unwrap();

    assert!(sent["id"].is_string());
    assert_eq!(returned, home_folder.id);
}

#[tokio::test]
async fn pages_through_more_folders_than_one_page_holds() {
    let home = ScratchFolder::new("library-pages-home");
    let comics = ScratchFolder::new("library-pages-comics");
    let library = open(home.path()).await;
    for index in 0..MORE_FOLDERS_THAN_A_PAGE_HOLDS {
        let folder = comics.path().join(format!("Sample Series {index:03}"));
        std::fs::create_dir(&folder).unwrap();
        library.add_folder(folder, |_| {}).await.unwrap();
    }

    let first_page = library.folders(None).await.unwrap();

    assert!(first_page.next.is_some());
    assert_eq!(
        all_folders(&library).await.len(),
        1 + MORE_FOLDERS_THAN_A_PAGE_HOLDS
    );
}

#[tokio::test]
async fn keeps_one_home_folder_at_its_new_location_after_the_home_moves() {
    let parent = ScratchFolder::new("library-moved-home");
    let comics = ScratchFolder::new("Moved Home Comics");
    let first_home = parent.path().join("Before");
    let moved_home = parent.path().join("After");
    let library = open(&first_home).await;
    library
        .add_folder(comics.path().to_path_buf(), |_| {})
        .await
        .unwrap();
    drop(library);
    std::fs::rename(&first_home, &moved_home).unwrap();

    let reopened = open(&moved_home).await;

    let folders = all_folders(&reopened).await;
    assert_eq!(
        kinds_and_names(&folders),
        [
            (FolderKind::Home, "After"),
            (FolderKind::Linked, "Moved Home Comics")
        ]
    );
    assert_eq!(
        folders.first().map(|folder| folder.location.clone()),
        Some(moved_home.display().to_string())
    );
}

#[tokio::test]
async fn opens_a_new_library_before_its_first_launch_is_finished() {
    let home = ScratchFolder::new("library-first-launch-new");

    let library = open(home.path()).await;

    assert!(!library.first_launch_finished().await.unwrap());
}

#[tokio::test]
async fn remembers_the_finished_first_launch_when_the_library_reopens() {
    let home = ScratchFolder::new("library-first-launch-finished");
    open(home.path()).await.finish_first_launch().await.unwrap();

    let reopened = open(home.path()).await;

    assert!(reopened.first_launch_finished().await.unwrap());
}

#[tokio::test]
async fn draws_a_new_library_in_the_view_a_new_library_starts_with() {
    let home = ScratchFolder::new("library-view-new");

    let view = open(home.path()).await.view().await.unwrap();

    assert_eq!(view, LibraryView::default());
}

#[tokio::test]
async fn remembers_the_view_set_on_this_device_when_the_library_reopens() {
    let home = ScratchFolder::new("library-view-set");
    let list = LibraryView {
        display: LibraryDisplay::List,
        covers_per_row: CoversPerRow {
            phone: PhoneCoversPerRow::try_from(2).unwrap(),
            tablet: TabletCoversPerRow::try_from(4).unwrap(),
            desktop: DesktopCoversPerRow::try_from(9).unwrap(),
        },
        shows_item_counts: true,
        on_covers: OnCovers {
            shows_unread_count: false,
            shows_downloaded: false,
            shows_language: true,
            shows_reading_progress: false,
            shows_continue_button: true,
        },
    };
    open(home.path()).await.set_view(list).await.unwrap();

    let reopened = open(home.path()).await;

    assert_eq!(reopened.view().await.unwrap(), list);
}

#[tokio::test]
async fn stores_the_fewest_and_the_most_covers_per_row_each_size_offers() {
    let home = ScratchFolder::new("library-view-ranges");
    let library = open(home.path()).await;
    let ranges = CoversPerRow::RANGES;
    let ends = [
        (
            ranges.phone.fewest,
            ranges.tablet.fewest,
            ranges.desktop.fewest,
        ),
        (ranges.phone.most, ranges.tablet.most, ranges.desktop.most),
    ];

    for (phone, tablet, desktop) in ends {
        let view = LibraryView {
            covers_per_row: CoversPerRow {
                phone: PhoneCoversPerRow::try_from(phone).unwrap(),
                tablet: TabletCoversPerRow::try_from(tablet).unwrap(),
                desktop: DesktopCoversPerRow::try_from(desktop).unwrap(),
            },
            ..LibraryView::default()
        };
        library.set_view(view).await.unwrap();

        assert_eq!(library.view().await.unwrap(), view);
    }
}

#[tokio::test]
async fn announces_a_new_title_order_when_the_app_s_language_changes() {
    let home = ScratchFolder::new("library-language-changed");
    let library = open(home.path()).await;
    let mut changes = library.subscribe();

    library.set_language("sv".parse().unwrap()).await.unwrap();

    assert_eq!(changes.try_recv(), Ok(Changed::TitleOrder));
}

#[tokio::test]
async fn keeps_the_title_order_when_the_app_s_language_is_the_one_titles_sort_by() {
    let home = ScratchFolder::new("library-language-kept");
    open(home.path())
        .await
        .set_language("sv".parse().unwrap())
        .await
        .unwrap();
    let reopened = open(home.path()).await;
    let mut changes = reopened.subscribe();

    reopened.set_language("sv".parse().unwrap()).await.unwrap();

    assert!(changes.try_recv().is_err());
}

#[tokio::test]
async fn knows_a_library_a_newer_version_wrote() {
    let home = ScratchFolder::new("library-from-a-newer-version");
    drop(open(home.path()).await);
    let database =
        omnileaf_db::rusqlite::Connection::open(home.path().join("library.sqlite")).unwrap();
    database.pragma_update(None, "user_version", 9999).unwrap();
    drop(database);

    let refused = Library::open(home.path().to_path_buf(), FixedClock).await;

    assert!(refused.is_err_and(|error| error.was_written_by_a_newer_version()));
}

#[test]
fn does_not_take_another_failure_for_a_newer_library() {
    let error = LibraryError::FolderNotFound {
        id: "7".parse().unwrap(),
    };

    assert!(!error.was_written_by_a_newer_version());
}
