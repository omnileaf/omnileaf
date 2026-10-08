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

use std::{fs, io, path::Path};

use books::write_book;
use omnileaf_engine::{
    AppleBookmark, LIBRARY_CHANGES_GATHERED_FOR, Library, LibraryChanged, LibraryChanges,
    ResolvedBookmark, RootLocator,
};
use support::{FixedClock, ScratchFolder};
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
    let home = ScratchFolder::new("changes-added-home");
    let comics = ScratchFolder::new("changes-added-comics");
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
async fn tells_of_a_bookmarked_folder_that_moved() {
    let home = ScratchFolder::new("changes-moved-home");
    let parent = ScratchFolder::new("changes-moved");
    let before = parent.path().join("Before");
    let after = parent.path().join("After");
    fs::create_dir(&before).unwrap();
    let library = open(home.path()).await;
    let picked = RootLocator::AppleBookmark {
        path: before.clone(),
        bookmark: AppleBookmark::new(b"bookmark picked in Files".to_vec()),
    };
    library.add_folder(picked, |_| {}).await.unwrap();
    fs::rename(&before, &after).unwrap();
    let mut changes = library.changes();
    caught_up(&mut changes).await;

    library
        .restore_folder_access(move |bookmark| {
            Ok::<_, io::Error>(ResolvedBookmark {
                path: after.clone(),
                refreshed: Some(bookmark.clone()),
            })
        })
        .await
        .unwrap();

    assert!(tells_of_a_change(&mut changes).await);
}

#[tokio::test(start_paused = true)]
async fn tells_of_every_change_close_together_once() {
    let home = ScratchFolder::new("changes-burst-home");
    let comics = ScratchFolder::new("changes-burst-comics");
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
    let home = ScratchFolder::new("changes-wait-home");
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
    let home = ScratchFolder::new("changes-title-order-home");
    let library = open(home.path()).await;
    let mut changes = library.changes();

    library.set_language("sv".parse().unwrap()).await.unwrap();

    assert!(tells_of_a_change(&mut changes).await);
}

#[tokio::test(start_paused = true)]
async fn tells_of_nothing_when_the_title_order_stays() {
    let home = ScratchFolder::new("changes-title-order-kept-home");
    let library = open(home.path()).await;
    library.set_language("sv".parse().unwrap()).await.unwrap();
    let mut changes = library.changes();

    library.set_language("sv".parse().unwrap()).await.unwrap();

    assert!(tells_of_no_change(&mut changes).await);
}

#[tokio::test(start_paused = true)]
async fn tells_of_a_folder_removed() {
    let home = ScratchFolder::new("changes-removed-home");
    let comics = ScratchFolder::new("changes-removed-comics");
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
    let home = ScratchFolder::new("changes-rescan-gone-home");
    let comics = ScratchFolder::new("changes-rescan-gone-comics");
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
    let home = ScratchFolder::new("changes-rescan-added-home");
    let comics = ScratchFolder::new("changes-rescan-added-comics");
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
    let home = ScratchFolder::new("changes-rescan-same-home");
    let comics = ScratchFolder::new("changes-rescan-same-comics");
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
    let home = ScratchFolder::new("changes-later-home");
    let comics = ScratchFolder::new("changes-later-comics");
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
    let home = ScratchFolder::new("changes-closed-home");
    let library = open(home.path()).await;
    let mut changes = library.changes();

    drop(library);

    let ended = timeout(LIBRARY_CHANGES_GATHERED_FOR, changes.next()).await;

    assert_eq!(ended, Ok(None));
}
