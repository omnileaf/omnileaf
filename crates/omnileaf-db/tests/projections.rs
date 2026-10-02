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
use proptest::{collection::vec, option, prelude::*};
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

#[tokio::test]
async fn rebuilds_around_registers_a_newer_version_wrote() {
    let folder = ScratchFolder::new("rebuild-unknown");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
    set_position(&store, book(1), 7).await.unwrap();
    store
        .database()
        .write(|transaction| {
            Ok(transaction.execute_batch(
                "INSERT INTO sync_register (entity, id, field, class, hlc, node, seq, value)
                 VALUES ('book', zeroblob(16), 'rating', 'lww', 1, zeroblob(16), 1, x'05'),
                        ('category', zeroblob(16), 'name', 'lww', 1, zeroblob(16), 2, x'f6')",
            )?)
        })
        .await
        .unwrap();
    let written = book_states(&store).await;

    store.rebuild_projections().await.unwrap();

    assert_eq!(book_states(&store).await, written);
}

#[derive(Clone, Debug)]
enum ReadingWrite {
    Position { book: u32, page: Option<u32> },
    Furthest { book: u32, page: u32 },
    Read { book: u32, is_read: Option<bool> },
}

fn any_reading_write() -> impl Strategy<Value = ReadingWrite> {
    prop_oneof![
        (0..3_u32, option::of(0..40_u32))
            .prop_map(|(book, page)| ReadingWrite::Position { book, page }),
        (0..3_u32, 0..40_u32).prop_map(|(book, page)| ReadingWrite::Furthest { book, page }),
        (0..3_u32, option::of(any::<bool>()))
            .prop_map(|(book, is_read)| ReadingWrite::Read { book, is_read }),
    ]
}

async fn apply(store: &Store, write: ReadingWrite) {
    store
        .write(move |writer| match write {
            ReadingWrite::Position {
                book: number,
                page: Some(page),
            } => writer.set_position(book(number), page),
            ReadingWrite::Position {
                book: number,
                page: None,
            } => writer.clear(LatestKey::BookPosition(book(number))),
            ReadingWrite::Furthest { book: number, page } => {
                writer.raise_furthest(book(number), page)
            }
            ReadingWrite::Read {
                book: number,
                is_read: Some(flag),
            } => writer.set_read(book(number), flag),
            ReadingWrite::Read {
                book: number,
                is_read: None,
            } => writer.clear(LatestKey::BookRead(book(number))),
        })
        .await
        .unwrap();
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(48))]

    #[test]
    fn rebuilding_from_the_registers_gives_what_applying_the_writes_one_by_one_gave(
        writes in vec(any_reading_write(), 1..12)
    ) {
        let runtime = tokio::runtime::Builder::new_current_thread().build().unwrap();
        let (written, rebuilt) = runtime.block_on(async {
            let folder = ScratchFolder::new("rebuild");
            let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
            for write in writes {
                apply(&store, write).await;
            }
            let written = book_states(&store).await;
            forget_book_states(&store).await;

            store.rebuild_projections().await.unwrap();

            (written, book_states(&store).await)
        });

        prop_assert_eq!(rebuilt, written);
    }
}

async fn forget_book_states(store: &Store) {
    store
        .database()
        .write(|transaction| Ok(transaction.execute("DELETE FROM book_state", [])?))
        .await
        .unwrap();
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
