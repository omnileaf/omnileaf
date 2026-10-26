#![expect(
    clippy::unwrap_used,
    reason = "each test writes its own folders in scratch space, so a failed set-up should stop the test"
)]

mod support;

use std::{fs, path::Path};

use omnileaf_db::rusqlite::Connection;
use omnileaf_engine::{
    FolderKind, FoundLibrary, HomeChoice, HomeFolderError, HomeFolderSetting, Library,
    LibraryListing,
};
use omnileaf_testkit::write_sample_library;
use support::{FixedClock, ScratchFolder};

const DATABASE_FILE: &str = "library.sqlite";
const SETTING_FILE: &str = "home-folder.json";
const SAMPLE_SERIES: u32 = 3;
const SAMPLE_BOOKS: u32 = 7;
const SCHEMA_FROM_THE_FUTURE: u32 = 9_999;

async fn open(home: &Path) -> Library {
    Library::open(home.to_path_buf(), FixedClock).await.unwrap()
}

/// Windows refuses to move or replace a file a dropped library still holds open until its save task next runs.
async fn close(library: Library) {
    drop(library);
    tokio::task::yield_now().await;
}

async fn library_read_in(home: &Path) {
    write_sample_library(home).unwrap();
    let library = open(home).await;
    library.rescan_folders().await.unwrap();
    close(library).await;
}

async fn new_library_in(data: &Path) -> HomeFolderSetting {
    close(open(data).await).await;
    HomeFolderSetting::in_folder(data.to_path_buf())
}

fn database_of(home: &Path) -> Vec<u8> {
    fs::read(home.join(DATABASE_FILE)).unwrap()
}

#[tokio::test]
async fn keeps_the_home_in_the_data_folder_until_another_is_chosen() {
    let data = ScratchFolder::new("setting-default");
    let setting = HomeFolderSetting::in_folder(data.path().to_path_buf());

    let home = setting.home().await.unwrap();

    assert_eq!(home, data.path());
}

#[tokio::test]
async fn calls_choosing_the_current_home_folder_no_change() {
    let data = ScratchFolder::new("setting-current");
    let setting = new_library_in(data.path()).await;

    let choice = setting.choose(data.path()).await.unwrap();

    assert_eq!(choice, HomeChoice::Current);
}

#[tokio::test]
async fn finds_the_library_already_in_a_chosen_folder() {
    let data = ScratchFolder::new("setting-found-data");
    let other = ScratchFolder::new("setting-found-other");
    let setting = new_library_in(data.path()).await;
    library_read_in(other.path()).await;

    let choice = setting.choose(other.path()).await.unwrap();

    assert_eq!(
        choice,
        HomeChoice::Found {
            library: FoundLibrary {
                series: SAMPLE_SERIES,
                books: SAMPLE_BOOKS,
                last_backup_at_ms: None,
            }
        }
    );
}

#[tokio::test]
async fn finds_a_chosen_folder_without_a_library_empty() {
    let data = ScratchFolder::new("setting-empty-data");
    let other = ScratchFolder::new("setting-empty-other");
    let setting = new_library_in(data.path()).await;
    write_sample_library(other.path()).unwrap();

    let choice = setting.choose(other.path()).await.unwrap();

    assert_eq!(choice, HomeChoice::Empty);
}

#[tokio::test]
async fn opens_the_library_it_was_told_to_use_from_then_on() {
    let data = ScratchFolder::new("setting-use-data");
    let other = ScratchFolder::new("setting-use-other");
    let setting = new_library_in(data.path()).await;
    library_read_in(other.path()).await;

    setting.use_library_in(other.path()).await.unwrap();

    let home = HomeFolderSetting::in_folder(data.path().to_path_buf())
        .home()
        .await
        .unwrap();
    assert_eq!(home, other.path());
    let library = open(&home).await;
    let folders = library.folders(None).await.unwrap().folders;
    assert_eq!(
        folders
            .iter()
            .map(|folder| (folder.kind, folder.name.as_str()))
            .collect::<Vec<_>>(),
        [(
            FolderKind::Home,
            other.path().file_name().unwrap().to_str().unwrap()
        )]
    );
    assert_eq!(
        library
            .series_count(LibraryListing::default().filter)
            .await
            .unwrap(),
        SAMPLE_SERIES
    );
}

#[tokio::test]
async fn leaves_both_libraries_as_they_were_when_told_to_use_one() {
    let data = ScratchFolder::new("setting-untouched-data");
    let other = ScratchFolder::new("setting-untouched-other");
    let setting = new_library_in(data.path()).await;
    library_read_in(other.path()).await;
    let before = (database_of(data.path()), database_of(other.path()));

    setting.use_library_in(other.path()).await.unwrap();

    assert_eq!(
        (database_of(data.path()), database_of(other.path())),
        before
    );
}

#[tokio::test]
async fn refuses_to_use_a_folder_that_holds_no_library() {
    let data = ScratchFolder::new("setting-none-data");
    let other = ScratchFolder::new("setting-none-other");
    let setting = new_library_in(data.path()).await;

    let used = setting.use_library_in(other.path()).await;

    assert!(matches!(used, Err(HomeFolderError::NoLibraryThere { .. })));
    assert_eq!(setting.home().await.unwrap(), data.path());
}

#[tokio::test]
async fn refuses_to_use_a_library_a_newer_version_wrote() {
    let data = ScratchFolder::new("setting-newer-data");
    let other = ScratchFolder::new("setting-newer-other");
    let setting = new_library_in(data.path()).await;
    library_read_in(other.path()).await;
    Connection::open(other.path().join(DATABASE_FILE))
        .unwrap()
        .pragma_update(None, "user_version", SCHEMA_FROM_THE_FUTURE)
        .unwrap();

    let used = setting.use_library_in(other.path()).await;

    assert!(matches!(
        used,
        Err(HomeFolderError::Library(error)) if error.was_written_by_a_newer_version()
    ));
    assert_eq!(setting.home().await.unwrap(), data.path());
}

#[tokio::test]
async fn refuses_a_home_whose_library_is_gone_rather_than_start_another() {
    let data = ScratchFolder::new("setting-gone-data");
    let other = ScratchFolder::new("setting-gone-other");
    let setting = new_library_in(data.path()).await;
    library_read_in(other.path()).await;
    setting.use_library_in(other.path()).await.unwrap();
    fs::remove_file(other.path().join(DATABASE_FILE)).unwrap();

    let home = setting.home().await;

    assert!(matches!(home, Err(HomeFolderError::LibraryMissing { path }) if path == other.path()));
}

#[tokio::test]
async fn offers_another_home_folder_after_the_library_of_this_one_is_gone() {
    let data = ScratchFolder::new("setting-recover-data");
    let gone = ScratchFolder::new("setting-recover-gone");
    let other = ScratchFolder::new("setting-recover-other");
    let setting = new_library_in(data.path()).await;
    library_read_in(gone.path()).await;
    setting.use_library_in(gone.path()).await.unwrap();
    fs::remove_file(gone.path().join(DATABASE_FILE)).unwrap();
    library_read_in(other.path()).await;

    let choice = setting.choose(other.path()).await;

    assert!(matches!(choice, Ok(HomeChoice::Found { .. })));
}

#[tokio::test]
async fn refuses_a_home_folder_setting_it_cannot_read() {
    let data = ScratchFolder::new("setting-malformed");
    fs::write(data.path().join(SETTING_FILE), b"{\"kind\":").unwrap();
    let setting = HomeFolderSetting::in_folder(data.path().to_path_buf());

    let home = setting.home().await;

    assert!(matches!(home, Err(HomeFolderError::Malformed { .. })));
}
