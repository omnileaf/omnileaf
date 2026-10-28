#![expect(
    clippy::unwrap_used,
    reason = "each test builds its own scratch library, so a failed set-up should stop the test"
)]

#[expect(
    dead_code,
    reason = "these tests take only the store's clock and book ids, never its reading helpers"
)]
mod store_support;
mod support;

use omnileaf_db::store::{Changed, Key, Store};
use omnileaf_sync_proto::{BookId, BookmarkId, ProfileId};
use store_support::{FakeClock, NOW_UNIX_MS, book, open_store};
use support::ScratchFolder;

const ANOTHER_PROFILE: &str = "0b5e1a3c-7d2f-8a4b-9c6d-1e2f3a4b5c6d";

fn another_profile() -> ProfileId {
    ANOTHER_PROFILE.parse().unwrap()
}

async fn set_bookmark(store: &Store, book: BookId, page: u32, is_bookmarked: bool) {
    store
        .write(move |writer| writer.set_bookmark(book, page, is_bookmarked))
        .await
        .unwrap();
}

async fn bookmarks(store: &Store) -> Vec<(BookId, u32)> {
    store
        .database()
        .read(|connection| {
            let mut statement = connection
                .prepare("SELECT book_id, page FROM book_bookmark ORDER BY book_id, page")?;
            let rows = statement
                .query_map([], |row| {
                    let book: Vec<u8> = row.get(0)?;
                    Ok((BookId::try_from(book.as_slice()).unwrap(), row.get(1)?))
                })?
                .collect::<Result<_, _>>()?;
            Ok(rows)
        })
        .await
        .unwrap()
}

fn sorted(mut bookmarks: Vec<(BookId, u32)>) -> Vec<(BookId, u32)> {
    bookmarks.sort();
    bookmarks
}

#[tokio::test]
async fn keeps_the_pages_of_a_book_that_are_bookmarked_and_not_a_page_that_was_removed() {
    let folder = ScratchFolder::new("bookmarks-kept");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));

    set_bookmark(&store, book(1), 3, true).await;
    set_bookmark(&store, book(1), 5, true).await;
    set_bookmark(&store, book(2), 3, true).await;
    set_bookmark(&store, book(1), 3, false).await;

    assert_eq!(
        bookmarks(&store).await,
        sorted(vec![(book(1), 5), (book(2), 3)])
    );
}

#[tokio::test]
async fn bookmarks_a_page_again_once_it_was_removed() {
    let folder = ScratchFolder::new("bookmarks-again");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
    set_bookmark(&store, book(1), 3, true).await;
    set_bookmark(&store, book(1), 3, false).await;

    set_bookmark(&store, book(1), 3, true).await;

    assert_eq!(bookmarks(&store).await, [(book(1), 3)]);
}

#[tokio::test]
async fn bookmarks_a_page_once_however_often_it_is_bookmarked() {
    let folder = ScratchFolder::new("bookmarks-twice");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));

    set_bookmark(&store, book(1), 3, true).await;
    set_bookmark(&store, book(1), 3, true).await;

    assert_eq!(bookmarks(&store).await, [(book(1), 3)]);
}

#[tokio::test]
async fn removes_a_bookmark_that_was_never_set_without_a_trace() {
    let folder = ScratchFolder::new("bookmarks-never");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));

    set_bookmark(&store, book(1), 3, false).await;

    assert_eq!(bookmarks(&store).await, []);
}

#[tokio::test]
async fn shows_each_profile_its_own_bookmarks() {
    let folder = ScratchFolder::new("bookmarks-profiles");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
    set_bookmark(&store, book(1), 3, true).await;
    store.switch_profile(another_profile()).await.unwrap();
    set_bookmark(&store, book(1), 7, true).await;
    let in_another_profile = bookmarks(&store).await;

    store
        .switch_profile(ProfileId::default_profile())
        .await
        .unwrap();

    assert_eq!(in_another_profile, [(book(1), 7)]);
    assert_eq!(bookmarks(&store).await, [(book(1), 3)]);
}

#[tokio::test]
async fn builds_the_bookmarks_again_from_the_registers() {
    let folder = ScratchFolder::new("bookmarks-rebuilt");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
    set_bookmark(&store, book(1), 3, true).await;
    set_bookmark(&store, book(1), 5, true).await;
    set_bookmark(&store, book(2), 9, true).await;
    set_bookmark(&store, book(1), 5, false).await;
    store
        .database()
        .write(|transaction| {
            transaction.execute("DELETE FROM book_bookmark", [])?;
            Ok(())
        })
        .await
        .unwrap();

    store.rebuild_projections().await.unwrap();

    assert_eq!(
        bookmarks(&store).await,
        sorted(vec![(book(1), 3), (book(2), 9)])
    );
}

#[tokio::test]
async fn announces_the_registers_a_bookmark_changed() {
    let folder = ScratchFolder::new("bookmarks-announced");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
    let mut heard = store.subscribe();

    set_bookmark(&store, book(1), 3, true).await;

    let Changed::Registers { keys, recounted } = heard.recv().await.unwrap() else {
        panic!("expected registers");
    };
    let id = BookmarkId::of(book(1), 3);
    assert!(
        keys.iter()
            .all(|key| matches!(key, Key::Bookmark(bookmark) if bookmark.id() == id))
    );
    assert_eq!((keys.len(), recounted), (4, false));
}

#[tokio::test]
async fn records_a_bookmark_by_the_id_of_its_book_and_page_in_registers_of_its_own() {
    let folder = ScratchFolder::new("bookmarks-registers");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));

    set_bookmark(&store, book(1), 3, true).await;

    let id = BookmarkId::of(book(1), 3);
    let fields = store
        .database()
        .read(move |connection| {
            let mut statement = connection
                .prepare("SELECT entity, field FROM sync_register WHERE id = ?1 ORDER BY field")?;
            let rows = statement
                .query_map([id.as_bytes()], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                })?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        })
        .await
        .unwrap();
    assert_eq!(
        fields,
        ["book_hi", "book_lo", "deleted", "page"]
            .map(|field| ("bookmark".to_owned(), field.to_owned()))
    );
}
