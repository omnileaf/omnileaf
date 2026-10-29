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

use std::collections::BTreeSet;

use omnileaf_db::{catalog::removed_among, store::Store};
use omnileaf_sync_proto::{BookId, ProfileId};
use store_support::{FakeClock, NOW_UNIX_MS, book, open_store, set_position};
use support::ScratchFolder;

const ANOTHER_PROFILE: &str = "0b5e1a3c-7d2f-8a4b-9c6d-1e2f3a4b5c6d";
const REMOVALS_PROJECTION: &str = "book_removed";
const MORE_THAN_ONE_BATCH: u32 = 70;

fn another_profile() -> ProfileId {
    ANOTHER_PROFILE.parse().unwrap()
}

async fn set_removed(store: &Store, book: BookId, is_removed: bool) {
    store
        .write(move |writer| writer.set_removed(book, is_removed))
        .await
        .unwrap();
}

async fn removed_books(store: &Store) -> Vec<BookId> {
    store
        .database()
        .read(|connection| {
            let mut statement =
                connection.prepare("SELECT book_id FROM book_removed ORDER BY book_id")?;
            let books = statement
                .query_map([], |row| {
                    let book: Vec<u8> = row.get(0)?;
                    Ok(BookId::try_from(book.as_slice()).unwrap())
                })?
                .collect::<Result<_, _>>()?;
            Ok(books)
        })
        .await
        .unwrap()
}

async fn removal_registers(store: &Store) -> Vec<(i64, i64)> {
    store
        .database()
        .read(|connection| {
            let mut statement = connection.prepare(
                "SELECT hlc, seq FROM sync_register WHERE field = 'removed' ORDER BY seq",
            )?;
            let registers = statement
                .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
                .collect::<Result<_, _>>()?;
            Ok(registers)
        })
        .await
        .unwrap()
}

async fn removed_among_books(store: &Store, books: Vec<BookId>) -> BTreeSet<BookId> {
    store
        .database()
        .read(move |connection| removed_among(connection, &books))
        .await
        .unwrap()
}

async fn count_rows(store: &Store, table: &'static str) -> u32 {
    store
        .database()
        .read(move |connection| {
            Ok(
                connection.query_row(&format!("SELECT count(*) FROM {table}"), [], |row| {
                    row.get(0)
                })?,
            )
        })
        .await
        .unwrap()
}

async fn forget_projected_removals(store: &Store) {
    store
        .database()
        .write(|transaction| {
            Ok(transaction.execute(&format!("DELETE FROM {REMOVALS_PROJECTION}"), [])?)
        })
        .await
        .unwrap();
}

#[tokio::test]
async fn marking_a_book_removed_shows_it_in_book_removed() {
    let folder = ScratchFolder::new("removed-marked");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));

    set_removed(&store, book(1), true).await;

    assert_eq!(removed_books(&store).await, [book(1)]);
}

#[tokio::test]
async fn clearing_a_removal_takes_the_book_out_of_book_removed() {
    let folder = ScratchFolder::new("removed-cleared");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
    set_removed(&store, book(1), true).await;
    set_removed(&store, book(2), true).await;

    set_removed(&store, book(1), false).await;

    assert_eq!(removed_books(&store).await, [book(2)]);
}

#[tokio::test]
async fn marking_an_already_removed_book_writes_no_new_register() {
    let folder = ScratchFolder::new("removed-twice");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
    set_removed(&store, book(1), true).await;
    let written = removal_registers(&store).await;

    set_removed(&store, book(1), true).await;

    assert_eq!(removal_registers(&store).await, written);
}

#[tokio::test]
async fn clearing_a_removal_that_was_never_marked_writes_no_register() {
    let folder = ScratchFolder::new("removed-never");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));

    set_removed(&store, book(1), false).await;

    assert_eq!(removal_registers(&store).await, []);
}

#[tokio::test]
async fn marking_a_cleared_book_removed_again_shows_it_in_book_removed() {
    let folder = ScratchFolder::new("removed-again");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
    set_removed(&store, book(1), true).await;
    set_removed(&store, book(1), false).await;

    set_removed(&store, book(1), true).await;

    assert_eq!(removed_books(&store).await, [book(1)]);
}

#[tokio::test]
async fn every_profile_sees_a_removal_the_household_wrote() {
    let folder = ScratchFolder::new("removed-household");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
    store.switch_profile(another_profile()).await.unwrap();
    set_removed(&store, book(1), true).await;

    store
        .switch_profile(ProfileId::default_profile())
        .await
        .unwrap();

    assert_eq!(removed_books(&store).await, [book(1)]);
}

#[tokio::test]
async fn rebuilding_the_projections_restores_removed_books() {
    let folder = ScratchFolder::new("removed-rebuilt");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
    set_removed(&store, book(1), true).await;
    set_removed(&store, book(2), true).await;
    set_removed(&store, book(2), false).await;
    forget_projected_removals(&store).await;

    store.rebuild_projections().await.unwrap();

    assert_eq!(removed_books(&store).await, [book(1)]);
}

#[tokio::test]
async fn rebuilding_creates_no_reading_state_for_a_removed_book() {
    let folder = ScratchFolder::new("removed-no-state");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
    set_removed(&store, book(1), true).await;
    set_position(&store, book(2), 4).await.unwrap();

    store.rebuild_projections().await.unwrap();

    assert_eq!(count_rows(&store, "book_state").await, 1);
}

#[tokio::test]
async fn removed_among_returns_only_the_marked_ids() {
    let folder = ScratchFolder::new("removed-among");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
    set_removed(&store, book(1), true).await;
    set_removed(&store, book(3), true).await;

    let removed = removed_among_books(&store, vec![book(1), book(2), book(4)]).await;

    assert_eq!(removed, BTreeSet::from([book(1)]));
}

#[tokio::test]
async fn removed_among_finds_the_marked_ids_beyond_one_batch() {
    let folder = ScratchFolder::new("removed-among-many");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
    let books: Vec<BookId> = (1..=MORE_THAN_ONE_BATCH).map(book).collect();
    let marked = books[(books.len() - 2)..].to_vec();
    for marked in &marked {
        set_removed(&store, *marked, true).await;
    }

    let removed = removed_among_books(&store, books).await;

    assert_eq!(removed, marked.into_iter().collect());
}

#[tokio::test]
async fn removed_among_finds_nothing_among_no_ids() {
    let folder = ScratchFolder::new("removed-among-none");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
    set_removed(&store, book(1), true).await;

    let removed = removed_among_books(&store, Vec::new()).await;

    assert_eq!(removed, BTreeSet::new());
}
