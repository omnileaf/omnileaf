#![expect(
    clippy::unwrap_used,
    reason = "each test changes its own scratch library, so a failed set-up should stop the test"
)]

#[expect(dead_code, reason = "these tests write whole books, never loose pages")]
mod books;
#[expect(
    dead_code,
    reason = "these tests need scratch folders but none of the files support can put in them"
)]
mod support;

use std::{fs, path::Path};

use books::write_book;
use omnileaf_engine::{LIBRARY_CHANGES_GATHERED_FOR, Library, LibraryChanged, LibraryChanges};
use support::{FixedClock, TempFolder};
use tokio::time::{Instant, timeout};

const BOOKS_IN_TWO_BATCHES: u64 = 33;

async fn open(home: &Path) -> Library {
    Library::open(home.to_path_buf(), FixedClock).await.unwrap()
}

fn write_books(folder: &Path, count: u64) {
    for seed in 0..count {
        write_book(
            &folder
                .join(format!("Sample Series {seed:03}"))
                .join("v01.cbz"),
            seed,
        );
    }
}

/// Every change already told of, so a test can wait for the one it makes next.
async fn caught_up(changes: &mut LibraryChanges) {
    while timeout(LIBRARY_CHANGES_GATHERED_FOR * 2, changes.next())
        .await
        .is_ok()
    {}
}

async fn tells_of_a_change(changes: &mut LibraryChanges) -> bool {
    timeout(LIBRARY_CHANGES_GATHERED_FOR * 4, changes.next())
        .await
        .is_ok_and(|told| told == Some(LibraryChanged))
}

async fn tells_of_no_change(changes: &mut LibraryChanges) -> bool {
    timeout(LIBRARY_CHANGES_GATHERED_FOR * 4, changes.next())
        .await
        .is_err()
}

#[tokio::test(start_paused = true)]
async fn tells_of_a_folder_added() {
    let home = TempFolder::new("changes-added-home");
    let comics = TempFolder::new("changes-added-comics");
    write_books(comics.path(), 1);
    let library = open(home.path()).await;
    let mut changes = library.changes();

    library
        .add_folder(comics.path().to_path_buf(), |_| {})
        .await
        .unwrap();

    assert!(tells_of_a_change(&mut changes).await);
}

#[tokio::test(start_paused = true)]
async fn tells_of_every_change_close_together_once() {
    let home = TempFolder::new("changes-burst-home");
    let comics = TempFolder::new("changes-burst-comics");
    write_books(comics.path(), BOOKS_IN_TWO_BATCHES);
    let library = open(home.path()).await;
    let mut changes = library.changes();
    library
        .add_folder(comics.path().to_path_buf(), |_| {})
        .await
        .unwrap();
    library.set_language("sv".parse().unwrap()).await.unwrap();

    let told = tells_of_a_change(&mut changes).await;

    assert!(told);
    assert!(tells_of_no_change(&mut changes).await);
}

#[tokio::test(start_paused = true)]
async fn waits_for_the_changes_close_behind_the_first_before_telling() {
    let home = TempFolder::new("changes-wait-home");
    let library = open(home.path()).await;
    let mut changes = library.changes();
    library.set_language("sv".parse().unwrap()).await.unwrap();
    let started = Instant::now();

    let told = tells_of_a_change(&mut changes).await;

    assert!(told);
    assert_eq!(started.elapsed(), LIBRARY_CHANGES_GATHERED_FOR);
}

#[tokio::test(start_paused = true)]
async fn tells_of_a_new_title_order() {
    let home = TempFolder::new("changes-title-order-home");
    let library = open(home.path()).await;
    let mut changes = library.changes();

    library.set_language("sv".parse().unwrap()).await.unwrap();

    assert!(tells_of_a_change(&mut changes).await);
}

#[tokio::test(start_paused = true)]
async fn tells_of_nothing_when_the_title_order_stays() {
    let home = TempFolder::new("changes-title-order-kept-home");
    let library = open(home.path()).await;
    library.set_language("sv".parse().unwrap()).await.unwrap();
    let mut changes = library.changes();

    library.set_language("sv".parse().unwrap()).await.unwrap();

    assert!(tells_of_no_change(&mut changes).await);
}

#[tokio::test(start_paused = true)]
async fn tells_of_a_folder_removed() {
    let home = TempFolder::new("changes-removed-home");
    let comics = TempFolder::new("changes-removed-comics");
    write_books(comics.path(), 1);
    let library = open(home.path()).await;
    library
        .add_folder(comics.path().to_path_buf(), |_| {})
        .await
        .unwrap();
    let linked = library.folders(None).await.unwrap().folders.pop().unwrap();
    let mut changes = library.changes();

    library.remove_folder(linked.id).await.unwrap();

    assert!(tells_of_a_change(&mut changes).await);
}

#[tokio::test(start_paused = true)]
async fn tells_of_a_rescan_that_found_a_book_gone() {
    let home = TempFolder::new("changes-rescan-gone-home");
    let comics = TempFolder::new("changes-rescan-gone-comics");
    write_books(comics.path(), 2);
    let library = open(home.path()).await;
    library
        .add_folder(comics.path().to_path_buf(), |_| {})
        .await
        .unwrap();
    let linked = library.folders(None).await.unwrap().folders.pop().unwrap();
    fs::remove_dir_all(comics.path().join("Sample Series 001")).unwrap();
    let mut changes = library.changes();

    library.rescan_folder(linked.id, |_| {}).await.unwrap();

    assert!(tells_of_a_change(&mut changes).await);
}

#[tokio::test(start_paused = true)]
async fn tells_of_a_rescan_that_found_a_book_added() {
    let home = TempFolder::new("changes-rescan-added-home");
    let comics = TempFolder::new("changes-rescan-added-comics");
    write_books(comics.path(), 1);
    let library = open(home.path()).await;
    library
        .add_folder(comics.path().to_path_buf(), |_| {})
        .await
        .unwrap();
    let linked = library.folders(None).await.unwrap().folders.pop().unwrap();
    write_books(comics.path(), 2);
    let mut changes = library.changes();

    library.rescan_folder(linked.id, |_| {}).await.unwrap();

    assert!(tells_of_a_change(&mut changes).await);
}

#[tokio::test(start_paused = true)]
async fn tells_of_nothing_after_a_rescan_that_found_nothing_changed() {
    let home = TempFolder::new("changes-rescan-same-home");
    let comics = TempFolder::new("changes-rescan-same-comics");
    write_books(comics.path(), 1);
    let library = open(home.path()).await;
    library
        .add_folder(comics.path().to_path_buf(), |_| {})
        .await
        .unwrap();
    let linked = library.folders(None).await.unwrap().folders.pop().unwrap();
    let mut changes = library.changes();

    library.rescan_folder(linked.id, |_| {}).await.unwrap();

    assert!(tells_of_no_change(&mut changes).await);
}

#[tokio::test(start_paused = true)]
async fn tells_of_a_change_made_after_the_last_one_told() {
    let home = TempFolder::new("changes-later-home");
    let comics = TempFolder::new("changes-later-comics");
    write_books(comics.path(), 1);
    let library = open(home.path()).await;
    let mut changes = library.changes();
    library.set_language("sv".parse().unwrap()).await.unwrap();
    caught_up(&mut changes).await;

    library
        .add_folder(comics.path().to_path_buf(), |_| {})
        .await
        .unwrap();

    assert!(tells_of_a_change(&mut changes).await);
}

#[tokio::test(start_paused = true)]
async fn ends_once_the_library_is_gone() {
    let home = TempFolder::new("changes-closed-home");
    let library = open(home.path()).await;
    let mut changes = library.changes();

    drop(library);

    let ended = timeout(LIBRARY_CHANGES_GATHERED_FOR, changes.next()).await;

    assert_eq!(ended, Ok(None));
}
