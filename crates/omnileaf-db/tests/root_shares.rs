#![expect(
    clippy::unwrap_used,
    reason = "each test builds its own scratch library, so a failed set-up should stop the test"
)]

mod support;

use std::{collections::BTreeMap, path::PathBuf};

use omnileaf_db::{
    Database,
    catalog::{
        NewRoot, RootId, RootKind, RootLocator, add_root, remember_root_share, remove_root,
        root_share, root_shares,
    },
};
use support::{ScratchFolder, library_config};

const ADDED_AT_MS: i64 = 1_780_000_000_000;
const MANGA_SHARE: &str = "smb://kai@nas.test/manga";

async fn add(database: &Database, path: &str) -> RootId {
    let root = NewRoot {
        kind: RootKind::Linked,
        locator: RootLocator::Path(PathBuf::from(path)),
        added_at_ms: ADDED_AT_MS,
    };
    database
        .write(move |transaction| add_root(transaction, &root))
        .await
        .unwrap()
}

async fn remember(database: &Database, id: RootId, address: Option<&'static str>) {
    database
        .write(move |transaction| remember_root_share(transaction, id, address))
        .await
        .unwrap();
}

async fn share_of(database: &Database, id: RootId) -> Option<String> {
    database
        .read(move |connection| root_share(connection, id))
        .await
        .unwrap()
}

#[tokio::test]
async fn remembers_the_share_a_folder_is_on() {
    let folder = ScratchFolder::new("root-share-remembered");
    let database = Database::open(&library_config(&folder)).unwrap();
    let manga = add(&database, "/Volumes/manga").await;
    let comics = add(&database, "/Users/kai/Comics").await;

    remember(&database, manga, Some(MANGA_SHARE)).await;

    let shares = database.read(root_shares).await.unwrap();
    assert_eq!(
        (shares, share_of(&database, comics).await),
        (BTreeMap::from([(manga, MANGA_SHARE.to_owned())]), None)
    );
}

#[tokio::test]
async fn forgets_the_share_of_a_folder_no_longer_on_one() {
    let folder = ScratchFolder::new("root-share-forgotten");
    let database = Database::open(&library_config(&folder)).unwrap();
    let manga = add(&database, "/Volumes/manga").await;
    remember(&database, manga, Some(MANGA_SHARE)).await;

    remember(&database, manga, None).await;

    assert_eq!(share_of(&database, manga).await, None);
}

#[tokio::test]
async fn forgets_the_share_of_a_removed_folder() {
    let folder = ScratchFolder::new("root-share-removed");
    let database = Database::open(&library_config(&folder)).unwrap();
    let manga = add(&database, "/Volumes/manga").await;
    remember(&database, manga, Some(MANGA_SHARE)).await;

    database
        .write(move |transaction| remove_root(transaction, manga))
        .await
        .unwrap();

    assert!(database.read(root_shares).await.unwrap().is_empty());
}
