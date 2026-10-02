#![expect(
    clippy::unwrap_used,
    reason = "each test opens its own library in a scratch folder, so a failed set-up should stop the test"
)]

mod support;

use std::path::Path;

use omnileaf_engine::{Clock, FolderId, FolderKind, Library, LibraryError, LibraryFolder};
use support::TempFolder;

const NOW_UNIX_MS: u64 = 1_790_000_000_000;
const MORE_FOLDERS_THAN_A_PAGE_HOLDS: usize = 120;

struct FixedClock;

impl Clock for FixedClock {
    fn now_unix_ms(&self) -> u64 {
        NOW_UNIX_MS
    }
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
async fn adds_a_folder_and_reports_the_comics_in_it() {
    let home = TempFolder::new("library-add-home");
    let comics = TempFolder::new("Sample Library").with_files(&["one.cbz", "Series/two.cbr"]);
    let library = open(home.path()).await;

    let survey = library
        .add_folder(comics.path().to_path_buf())
        .await
        .unwrap();

    assert_eq!(survey.comic_files, 2);
    assert_eq!(
        kinds_and_names(&all_folders(&library).await),
        [
            (FolderKind::Home, "library-add-home"),
            (FolderKind::Linked, "Sample Library")
        ]
    );
}

#[tokio::test]
async fn remembers_its_folders_after_a_restart() {
    let home = TempFolder::new("library-restart-home");
    let comics = TempFolder::new("Sample Comics");
    let library = open(home.path()).await;
    library
        .add_folder(comics.path().to_path_buf())
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

    let outcome = library.add_folder(home.path().join("not-there")).await;

    assert!(matches!(outcome, Err(LibraryError::Survey(_))));
    assert_eq!(
        kinds_and_names(&all_folders(&library).await),
        [(FolderKind::Home, "library-unreadable-home")]
    );
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
        library.add_folder(folder).await.unwrap();
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
        .add_folder(comics.path().to_path_buf())
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
