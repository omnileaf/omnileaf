#![expect(
    clippy::unwrap_used,
    reason = "each test builds its own scratch library, so a failed set-up should stop the test"
)]

mod store_support;
mod support;

use omnileaf_db::{
    Error,
    store::{LatestKey, Store},
};
use omnileaf_sync_proto::BookId;
use store_support::{FakeClock, NOW_UNIX_MS, book, open_store, raise_furthest, set_position};
use support::ScratchFolder;

#[derive(Debug, PartialEq, Eq)]
struct BookState {
    book: BookId,
    position_page: Option<u64>,
    furthest_page: Option<u64>,
    is_read: Option<bool>,
}

#[tokio::test]
async fn projects_each_reading_register_into_the_book_state() {
    let folder = ScratchFolder::new("project");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));

    store
        .write(|writer| {
            writer.set_position(book(1), 7)?;
            writer.raise_furthest(book(1), 9)?;
            writer.set_read(book(1), false)
        })
        .await
        .unwrap();

    assert_eq!(
        book_states(&store).await,
        [BookState {
            book: book(1),
            position_page: Some(7),
            furthest_page: Some(9),
            is_read: Some(false),
        }]
    );
}

#[tokio::test]
async fn keeps_the_furthest_page_when_a_lower_one_is_raised() {
    let folder = ScratchFolder::new("project-lower");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
    raise_furthest(&store, book(1), 20).await;

    raise_furthest(&store, book(1), 10).await;

    let furthest: Vec<Option<u64>> = book_states(&store)
        .await
        .into_iter()
        .map(|state| state.furthest_page)
        .collect();
    assert_eq!(furthest, [Some(20)]);
}

#[tokio::test]
async fn projects_a_cleared_position_as_absent() {
    let folder = ScratchFolder::new("project-cleared");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
    set_position(&store, book(1), 7).await.unwrap();

    store
        .write(|writer| writer.clear(LatestKey::BookPosition(book(1))))
        .await
        .unwrap();

    let positions: Vec<Option<u64>> = book_states(&store)
        .await
        .into_iter()
        .map(|state| state.position_page)
        .collect();
    assert_eq!(positions, [None]);
}

#[tokio::test]
async fn keeps_no_register_or_sequence_number_from_a_write_that_failed_to_project() {
    let folder = ScratchFolder::new("project-failed");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
    refuse_book_state_for(&store, book(1)).await;

    let outcome = store
        .write(|writer| {
            let _ = writer.set_position(book(1), 7);
            writer.set_position(book(2), 3)
        })
        .await;
    set_position(&store, book(3), 5).await.unwrap();

    assert!(matches!(outcome, Err(Error::FailedWriteIgnored)));
    assert_eq!(register_seqs(&store).await, [1]);
}

async fn book_states(store: &Store) -> Vec<BookState> {
    store
        .database()
        .read(|connection| {
            let mut statement = connection.prepare(
                "SELECT book_id, position_page, furthest_page, is_read
                 FROM book_state ORDER BY book_id",
            )?;
            let rows = statement.query_map([], |row| {
                Ok(BookState {
                    book: BookId::try_from(row.get_ref(0)?.as_blob()?).unwrap(),
                    position_page: row.get(1)?,
                    furthest_page: row.get(2)?,
                    is_read: row.get(3)?,
                })
            })?;
            Ok(rows.collect::<Result<_, _>>()?)
        })
        .await
        .unwrap()
}

async fn refuse_book_state_for(store: &Store, book: BookId) {
    store
        .database()
        .write(move |transaction| {
            transaction.execute_batch(
                "CREATE TABLE refused_book (id BLOB NOT NULL);
                 CREATE TRIGGER refuse_book BEFORE INSERT ON book_state
                 WHEN new.book_id IN (SELECT id FROM refused_book)
                 BEGIN SELECT RAISE(ABORT, 'refused'); END;",
            )?;
            transaction.execute(
                "INSERT INTO refused_book (id) VALUES (?1)",
                [book.as_bytes()],
            )?;
            Ok(())
        })
        .await
        .unwrap();
}

async fn register_seqs(store: &Store) -> Vec<u64> {
    store
        .database()
        .read(|connection| {
            let mut statement = connection.prepare("SELECT seq FROM sync_register ORDER BY seq")?;
            let seqs = statement.query_map([], |row| row.get(0))?;
            Ok(seqs.collect::<Result<_, _>>()?)
        })
        .await
        .unwrap()
}
