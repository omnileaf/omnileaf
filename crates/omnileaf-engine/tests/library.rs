#![expect(
    clippy::unwrap_used,
    reason = "each test opens its own library in a scratch folder, so a failed set-up should stop the test"
)]

mod support;

use std::path::Path;

use omnileaf_engine::{
    Changed, CoversPerRow, DesktopCoversPerRow, FolderId, FolderKind, Library, LibraryDisplay,
    LibraryError, LibraryFolder, LibraryView, PhoneCoversPerRow, ScanProgress, TabletCoversPerRow,
};
use omnileaf_testkit::{SAMPLE_LIBRARY_NAME, write_sample_library};
use support::{FixedClock, TempFolder};

const MORE_FOLDERS_THAN_A_PAGE_HOLDS: usize = 120;

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
    let home = TempFolder::new("library-home").with_files(&["Omnileaf/.keep"]);
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
    let home = TempFolder::new("library-add-home");
    let comics = TempFolder::new("library-add-comics");
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
async fn remembers_its_folders_after_a_restart() {
    let home = TempFolder::new("library-restart-home");
    let comics = TempFolder::new("Sample Comics");
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
    let home = TempFolder::new("library-unreadable-home");
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
    let home = TempFolder::new("library-remove-home");
    let comics = TempFolder::new("Removed Comics").with_files(&["one.cbz"]);
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
    let home = TempFolder::new("library-keep-home");
    let library = open(home.path()).await;
    let home_folder = folder_named(&library, "library-keep-home").await;

    let outcome = library.remove_folder(home_folder.id).await;

    assert!(matches!(outcome, Err(LibraryError::HomeFolderKept { id }) if id == home_folder.id));
    assert!(names_the_folder(&outcome, home_folder.id));
}

#[tokio::test]
async fn reports_a_folder_already_removed() {
    let home = TempFolder::new("library-removed-twice-home");
    let comics = TempFolder::new("Removed Twice");
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
    let home = TempFolder::new("library-id-home");
    let library = open(home.path()).await;
    let home_folder = folder_named(&library, "library-id-home").await;
    let sent = serde_json::to_value(&home_folder).unwrap();

    let returned: FolderId = serde_json::from_value(sent["id"].clone()).unwrap();

    assert!(sent["id"].is_string());
    assert_eq!(returned, home_folder.id);
}

#[tokio::test]
async fn pages_through_more_folders_than_one_page_holds() {
    let home = TempFolder::new("library-pages-home");
    let comics = TempFolder::new("library-pages-comics");
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
    let parent = TempFolder::new("library-moved-home");
    let comics = TempFolder::new("Moved Home Comics");
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
    let home = TempFolder::new("library-first-launch-new");

    let library = open(home.path()).await;

    assert!(!library.first_launch_finished().await.unwrap());
}

#[tokio::test]
async fn remembers_the_finished_first_launch_when_the_library_reopens() {
    let home = TempFolder::new("library-first-launch-finished");
    open(home.path()).await.finish_first_launch().await.unwrap();

    let reopened = open(home.path()).await;

    assert!(reopened.first_launch_finished().await.unwrap());
}

#[tokio::test]
async fn draws_a_new_library_in_the_view_a_new_library_starts_with() {
    let home = TempFolder::new("library-view-new");

    let view = open(home.path()).await.view().await.unwrap();

    assert_eq!(view, LibraryView::default());
}

#[tokio::test]
async fn remembers_the_view_set_on_this_device_when_the_library_reopens() {
    let home = TempFolder::new("library-view-set");
    let list = LibraryView {
        display: LibraryDisplay::List,
        covers_per_row: CoversPerRow {
            phone: PhoneCoversPerRow::try_from(2).unwrap(),
            tablet: TabletCoversPerRow::try_from(4).unwrap(),
            desktop: DesktopCoversPerRow::try_from(9).unwrap(),
        },
        shows_item_counts: true,
    };
    open(home.path()).await.set_view(list).await.unwrap();

    let reopened = open(home.path()).await;

    assert_eq!(reopened.view().await.unwrap(), list);
}

#[tokio::test]
async fn stores_the_fewest_and_the_most_covers_per_row_each_size_offers() {
    let home = TempFolder::new("library-view-ranges");
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
    let home = TempFolder::new("library-language-changed");
    let library = open(home.path()).await;
    let mut changes = library.subscribe();

    library.set_language("sv".parse().unwrap()).await.unwrap();

    assert_eq!(changes.try_recv(), Ok(Changed::TitleOrder));
}

#[tokio::test]
async fn keeps_the_title_order_when_the_app_s_language_is_the_one_titles_sort_by() {
    let home = TempFolder::new("library-language-kept");
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
