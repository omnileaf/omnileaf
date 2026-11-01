#![expect(
    clippy::unwrap_used,
    reason = "each test opens its own library in scratch folders, so a failed set-up should stop the test"
)]

mod support;
#[expect(dead_code, reason = "these tests never count the files opened")]
mod tree_of_folder;

use std::{fs, path::Path, sync::Arc};

use omnileaf_engine::{
    AndroidTree, FolderKind, HomeChoice, Library, LibraryError, LibraryFolder, RescanOutcome,
    RootLocator, TreeUri, home_tree_location,
};
use omnileaf_testkit::{SAMPLE_LIBRARY_NAME, write_sample_library};
use support::{FixedClock, ScratchFolder};
use tree_of_folder::TreeOfFolder;

const COMICS_TREE: &str = "content://documents.test/tree/primary%3ADocuments%2FComics";
const MANGA_TREE: &str = "content://documents.test/tree/primary%3ADocuments%2FManga";
const INTERNAL_DOCUMENTS: &str = "Internal storage › Documents";
const SAMPLE_BOOKS: u32 = 7;

fn tree(uri: &str) -> AndroidTree {
    AndroidTree::new(
        TreeUri::parse(uri.to_owned()).unwrap(),
        SAMPLE_LIBRARY_NAME.to_owned(),
        INTERNAL_DOCUMENTS.to_owned(),
    )
    .unwrap()
}

async fn open(app_storage: &Path) -> Library {
    Library::open(app_storage.to_path_buf(), FixedClock)
        .await
        .unwrap()
}

async fn open_reading(app_storage: &Path, trees: &Arc<TreeOfFolder>) -> Library {
    open(app_storage).await.reading_trees_with(trees.opener())
}

async fn folder_of(library: &Library, kind: FolderKind) -> Option<LibraryFolder> {
    library
        .folders(None)
        .await
        .unwrap()
        .folders
        .into_iter()
        .find(|folder| folder.kind == kind)
}

async fn home(library: &Library) -> LibraryFolder {
    folder_of(library, FolderKind::Home).await.unwrap()
}

#[tokio::test]
async fn offers_a_tree_other_than_the_home_folder_as_a_move() {
    let app_storage = ScratchFolder::new("tree-home-choose-storage");
    let trees = TreeOfFolder::new("tree-home-choose-comics");
    let library = open_reading(app_storage.path(), &trees).await;

    let choice = library.choose_home_tree(&tree(COMICS_TREE)).await.unwrap();

    assert_eq!(choice, HomeChoice::Empty);
}

#[tokio::test]
async fn recognises_the_tree_already_chosen_as_the_home_folder() {
    let app_storage = ScratchFolder::new("tree-home-current-storage");
    let trees = TreeOfFolder::new("tree-home-current-comics");
    let library = open_reading(app_storage.path(), &trees).await;
    library.move_home_to_tree(tree(COMICS_TREE)).await.unwrap();

    let choice = library.choose_home_tree(&tree(COMICS_TREE)).await.unwrap();

    assert_eq!(choice, HomeChoice::Current);
}

#[tokio::test]
async fn refuses_a_tree_nothing_can_open_before_it_is_chosen() {
    let app_storage = ScratchFolder::new("tree-home-unopenable-storage");
    let library = open(app_storage.path()).await;

    let choice = library.choose_home_tree(&tree(COMICS_TREE)).await;

    assert!(matches!(choice, Err(LibraryError::FolderUnreadable { .. })));
}

#[tokio::test]
async fn refuses_a_tree_it_lost_access_to_before_it_is_chosen() {
    let app_storage = ScratchFolder::new("tree-home-revoked-storage");
    let trees = TreeOfFolder::new("tree-home-revoked-comics");
    trees.lose_access();
    let library = open_reading(app_storage.path(), &trees).await;

    let choice = library.choose_home_tree(&tree(COMICS_TREE)).await;

    assert!(matches!(choice, Err(LibraryError::FolderUnreadable { .. })));
}

#[tokio::test]
async fn moves_the_home_folder_to_a_tree_and_names_it_by_where_it_is() {
    let app_storage = ScratchFolder::new("tree-home-move-storage");
    let trees = TreeOfFolder::new("tree-home-move-comics");
    let library = open_reading(app_storage.path(), &trees).await;

    let moved = library.move_home_to_tree(tree(COMICS_TREE)).await.unwrap();

    let home = home(&library).await;
    assert_eq!(home.id, moved);
    assert_eq!(
        home.location,
        format!("{INTERNAL_DOCUMENTS} › {SAMPLE_LIBRARY_NAME}")
    );
    assert_eq!(home.location, home_tree_location(&tree(COMICS_TREE)));
}

#[tokio::test]
async fn reads_the_books_of_the_tree_the_home_folder_moved_to() {
    let app_storage = ScratchFolder::new("tree-home-books-storage");
    let trees = TreeOfFolder::new("tree-home-books-comics");
    let library = open_reading(app_storage.path(), &trees).await;
    let moved = library.move_home_to_tree(tree(COMICS_TREE)).await.unwrap();

    let rescan = library.rescan_folder(moved, |_| {}).await.unwrap();

    assert!(matches!(rescan.outcome, RescanOutcome::Rescanned(_)));
    assert_eq!(
        library.folder_book_count(moved).await.unwrap(),
        SAMPLE_BOOKS
    );
}

#[tokio::test]
async fn keeps_the_tree_as_the_home_folder_when_the_library_opens_again() {
    let app_storage = ScratchFolder::new("tree-home-reopen-storage");
    let trees = TreeOfFolder::new("tree-home-reopen-comics");
    let library = open_reading(app_storage.path(), &trees).await;
    let moved = library.move_home_to_tree(tree(COMICS_TREE)).await.unwrap();
    library.rescan_folder(moved, |_| {}).await.unwrap();
    drop(library);

    let reopened = open_reading(app_storage.path(), &trees).await;

    let home = home(&reopened).await;
    assert_eq!(home.id, moved);
    assert_eq!(
        reopened.folder_book_count(moved).await.unwrap(),
        SAMPLE_BOOKS
    );
    assert!(folder_of(&reopened, FolderKind::Linked).await.is_none());
}

#[tokio::test]
async fn keeps_the_books_left_in_app_storage_as_a_linked_folder() {
    let app_storage = ScratchFolder::new("tree-home-left-storage");
    write_sample_library(app_storage.path()).unwrap();
    let trees = TreeOfFolder::new("tree-home-left-comics");
    let library = open_reading(app_storage.path(), &trees).await;
    let old_home = home(&library).await;
    library.rescan_folder(old_home.id, |_| {}).await.unwrap();

    library.move_home_to_tree(tree(COMICS_TREE)).await.unwrap();

    let linked = folder_of(&library, FolderKind::Linked).await.unwrap();
    assert_eq!(linked.id, old_home.id);
    assert_eq!(
        library.folder_book_count(linked.id).await.unwrap(),
        SAMPLE_BOOKS
    );
}

#[tokio::test]
async fn drops_an_app_storage_home_that_holds_no_books() {
    let app_storage = ScratchFolder::new("tree-home-bare-storage");
    let trees = TreeOfFolder::new("tree-home-bare-comics");
    let library = open_reading(app_storage.path(), &trees).await;

    library.move_home_to_tree(tree(COMICS_TREE)).await.unwrap();

    assert!(folder_of(&library, FolderKind::Linked).await.is_none());
    assert_eq!(library.folders(None).await.unwrap().folders.len(), 1);
}

#[tokio::test]
async fn keeps_the_books_of_the_tree_it_moved_away_from_as_a_linked_folder() {
    let app_storage = ScratchFolder::new("tree-home-switch-storage");
    let trees = TreeOfFolder::new("tree-home-switch-comics");
    let library = open_reading(app_storage.path(), &trees).await;
    let first = library.move_home_to_tree(tree(COMICS_TREE)).await.unwrap();
    library.rescan_folder(first, |_| {}).await.unwrap();

    let second = library.move_home_to_tree(tree(MANGA_TREE)).await.unwrap();

    assert_ne!(first, second);
    assert_eq!(home(&library).await.id, second);
    let linked = folder_of(&library, FolderKind::Linked).await.unwrap();
    assert_eq!(linked.id, first);
    assert_eq!(
        library.folder_book_count(first).await.unwrap(),
        SAMPLE_BOOKS
    );
}

#[tokio::test]
async fn leaves_the_home_folder_alone_when_the_tree_cannot_be_opened() {
    let app_storage = ScratchFolder::new("tree-home-refused-storage");
    let library = open(app_storage.path()).await;
    let before = home(&library).await;

    let moved = library.move_home_to_tree(tree(COMICS_TREE)).await;

    assert!(matches!(moved, Err(LibraryError::FolderUnreadable { .. })));
    assert_eq!(home(&library).await, before);
}

#[tokio::test]
async fn keeps_the_books_of_a_home_tree_it_lost_access_to() {
    let app_storage = ScratchFolder::new("tree-home-lost-storage");
    let trees = TreeOfFolder::new("tree-home-lost-comics");
    let library = open_reading(app_storage.path(), &trees).await;
    let moved = library.move_home_to_tree(tree(COMICS_TREE)).await.unwrap();
    library.rescan_folder(moved, |_| {}).await.unwrap();
    trees.lose_access();

    let rescan = library.rescan_folder(moved, |_| {}).await.unwrap();

    assert_eq!(rescan.outcome, RescanOutcome::Unreachable);
    assert!(!home(&library).await.is_available);
    assert_eq!(
        library.folder_book_count(moved).await.unwrap(),
        SAMPLE_BOOKS
    );
}

#[tokio::test]
async fn keeps_the_books_of_a_home_tree_that_lists_empty() {
    let app_storage = ScratchFolder::new("tree-home-unplugged-storage");
    let trees = TreeOfFolder::new("tree-home-unplugged-comics");
    let library = open_reading(app_storage.path(), &trees).await;
    let moved = library.move_home_to_tree(tree(COMICS_TREE)).await.unwrap();
    library.rescan_folder(moved, |_| {}).await.unwrap();
    let shelf = trees.scratch.path().join(SAMPLE_LIBRARY_NAME);
    fs::remove_dir_all(&shelf).unwrap();
    fs::create_dir(&shelf).unwrap();

    let rescan = library.rescan_folder(moved, |_| {}).await.unwrap();

    assert_eq!(rescan.outcome, RescanOutcome::FoundEmpty);
    assert_eq!(
        library.folder_book_count(moved).await.unwrap(),
        SAMPLE_BOOKS
    );
}

#[tokio::test]
async fn chooses_a_tree_already_linked_by_making_it_the_home_folder() {
    let app_storage = ScratchFolder::new("tree-home-linked-storage");
    let trees = TreeOfFolder::new("tree-home-linked-comics");
    let library = open_reading(app_storage.path(), &trees).await;
    library
        .add_folder(RootLocator::AndroidTree(tree(COMICS_TREE)), |_| {})
        .await
        .unwrap();
    let linked = folder_of(&library, FolderKind::Linked).await.unwrap();

    let moved = library.move_home_to_tree(tree(COMICS_TREE)).await.unwrap();

    assert_eq!(moved, linked.id);
    assert_eq!(home(&library).await.id, linked.id);
    assert_eq!(
        library.folder_book_count(linked.id).await.unwrap(),
        SAMPLE_BOOKS
    );
}
