#![expect(
    clippy::unwrap_used,
    reason = "each test builds its own scratch library, so a failed set-up should stop the test"
)]

mod store_support;
mod support;

use std::collections::BTreeSet;

use omnileaf_db::store::{Changed, Key, LatestKey, MaximumKey, ReadingState, Store, reading_state};
use omnileaf_sync_proto::BookId;
use store_support::{FakeClock, NOW_UNIX_MS, book, open_store, raise_furthest, set_position};
use support::ScratchFolder;
use tokio::sync::broadcast::error::TryRecvError;

#[tokio::test]
async fn reads_no_state_for_a_book_nothing_was_read_in() {
    let folder = ScratchFolder::new("state-unread");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));

    let state = state_of(&store, book(1)).await;

    assert_eq!(state, None);
}

#[tokio::test]
async fn reads_back_the_state_written_for_a_book() {
    let folder = ScratchFolder::new("state-written");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
    read_partly(&store, book(1)).await;

    let state = state_of(&store, book(1)).await;

    assert_eq!(state, Some(PARTLY_READ));
}

#[tokio::test]
async fn reads_no_state_for_a_book_whose_registers_were_all_cleared() {
    let folder = ScratchFolder::new("state-cleared");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
    set_position(&store, book(1), 4).await.unwrap();

    store
        .write(|writer| writer.clear(LatestKey::BookPosition(book(1))))
        .await
        .unwrap();

    assert_eq!(state_of(&store, book(1)).await, None);
}

#[tokio::test]
async fn carries_a_book_s_state_onto_another_book_through_synced_writes() {
    let folder = ScratchFolder::new("state-carried");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
    read_partly(&store, book(1)).await;
    let mut changes = store.subscribe();

    store
        .write(|writer| writer.carry_reading_state(book(1), book(2)))
        .await
        .unwrap();

    assert_eq!(state_of(&store, book(2)).await, Some(PARTLY_READ));
    assert_eq!(state_of(&store, book(1)).await, Some(PARTLY_READ));
    assert_eq!(
        changes.try_recv(),
        Ok(Changed::Registers {
            keys: BTreeSet::from([
                Key::from(LatestKey::BookPosition(book(2))),
                LatestKey::BookRead(book(2)).into(),
                MaximumKey::BookFurthest(book(2)).into(),
            ])
        })
    );
}

#[tokio::test]
async fn carries_only_the_registers_the_book_has() {
    let folder = ScratchFolder::new("state-carried-position");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
    raise_furthest(&store, book(1), 4).await;

    store
        .write(|writer| writer.carry_reading_state(book(1), book(2)))
        .await
        .unwrap();

    assert_eq!(
        state_of(&store, book(2)).await,
        Some(ReadingState {
            furthest_page: Some(4),
            ..ReadingState::default()
        })
    );
}

#[tokio::test]
async fn leaves_a_book_with_state_of_its_own_as_it_is() {
    let folder = ScratchFolder::new("state-kept");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
    read_partly(&store, book(1)).await;
    set_position(&store, book(2), 30).await.unwrap();
    let mut changes = store.subscribe();

    store
        .write(|writer| writer.carry_reading_state(book(1), book(2)))
        .await
        .unwrap();

    assert_eq!(
        state_of(&store, book(2)).await,
        Some(ReadingState {
            position_page: Some(30),
            ..ReadingState::default()
        })
    );
    assert_eq!(changes.try_recv(), Err(TryRecvError::Empty));
}

#[tokio::test]
async fn carries_nothing_from_a_book_nothing_was_read_in() {
    let folder = ScratchFolder::new("state-nothing-to-carry");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));

    store
        .write(|writer| writer.carry_reading_state(book(1), book(2)))
        .await
        .unwrap();

    assert_eq!(state_of(&store, book(2)).await, None);
}

const PARTLY_READ: ReadingState = ReadingState {
    position_page: Some(7),
    furthest_page: Some(9),
    is_read: Some(false),
};

async fn read_partly(store: &Store, book: BookId) {
    store
        .write(move |writer| {
            writer.set_position(book, 7)?;
            writer.raise_furthest(book, 9)?;
            writer.set_read(book, false)
        })
        .await
        .unwrap();
}

async fn state_of(store: &Store, book: BookId) -> Option<ReadingState> {
    store
        .database()
        .read(move |connection| reading_state(connection, book))
        .await
        .unwrap()
}
