#![expect(
    clippy::unwrap_used,
    reason = "each test opens its own library in a scratch folder, so a failed set-up should stop the test"
)]

mod support;

use std::path::Path;

use omnileaf_engine::{
    AndroidTree, FolderKind, Library, LibraryError, LibraryFolder, RootLocator, TreeUri,
};
use support::{FixedClock, ScratchFolder};

const COMICS_TREE: &str = "content://documents.test/tree/primary%3ADocuments%2FComics";

fn comics_tree() -> RootLocator {
    RootLocator::AndroidTree(
        AndroidTree::new(
            TreeUri::parse(COMICS_TREE.to_owned()).unwrap(),
            "Comics".to_owned(),
            "Internal storage › Documents".to_owned(),
        )
        .unwrap(),
    )
}

async fn open(home: &Path) -> Library {
    Library::open(home.to_path_buf(), FixedClock).await.unwrap()
}

async fn folder_kinds(library: &Library) -> Vec<FolderKind> {
    let page = library.folders(None).await.unwrap();
    page.folders
        .iter()
        .map(|folder: &LibraryFolder| folder.kind)
        .collect()
}

#[tokio::test]
async fn refuses_to_add_an_android_folder_it_has_no_way_to_open() {
    let home = ScratchFolder::new("tree-unopenable-home");
    let library = open(home.path()).await;

    let outcome = library.add_folder(comics_tree(), |_| {}).await;

    assert!(matches!(
        outcome,
        Err(LibraryError::FolderUnreadable { .. })
    ));
    assert_eq!(folder_kinds(&library).await, [FolderKind::Home]);
}
