#![expect(
    clippy::unwrap_used,
    reason = "each test builds its own scratch library, so a failed set-up should stop the test"
)]

mod support;

use std::sync::{
    Arc,
    atomic::{AtomicU64, Ordering},
};

use omnileaf_db::{
    Database, Error,
    store::{Clock, LatestKey, Store},
};
use omnileaf_sync_proto::{BookId, Fingerprint, Hlc, ImageEntry, Value};
use support::ScratchFolder;

const NOW_UNIX_MS: u64 = 1_790_000_000_000;

#[derive(Clone)]
struct FakeClock(Arc<AtomicU64>);

impl FakeClock {
    fn at(unix_ms: u64) -> Self {
        Self(Arc::new(AtomicU64::new(unix_ms)))
    }

    fn set(&self, unix_ms: u64) {
        self.0.store(unix_ms, Ordering::Relaxed);
    }
}

impl Clock for FakeClock {
    fn now_unix_ms(&self) -> u64 {
        self.0.load(Ordering::Relaxed)
    }
}

#[derive(Debug, PartialEq, Eq)]
struct StoredRegister {
    entity: String,
    field: String,
    class: String,
    hlc: u64,
    node: [u8; 16],
    seq: u64,
    rank: Option<u32>,
    value: Vec<u8>,
}

#[tokio::test]
async fn gives_each_new_library_a_node_id_of_its_own() {
    let folders = [ScratchFolder::new("node-a"), ScratchFolder::new("node-b")];

    let mut node_ids = Vec::new();
    for folder in &folders {
        node_ids.push(local_node_id(&Database::open(&folder.config()).unwrap()).await);
    }

    assert_ne!(node_ids.first(), node_ids.last());
}

#[tokio::test]
async fn records_a_set_stamped_by_this_device_with_its_first_sequence_number() {
    let folder = ScratchFolder::new("set");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));

    set_position(&store, book(1), 12).await.unwrap();

    assert_eq!(
        registers(&store).await,
        [StoredRegister {
            entity: "book".to_owned(),
            field: "pos".to_owned(),
            class: "lww".to_owned(),
            hlc: Hlc::new(NOW_UNIX_MS, 0).unwrap().as_u64(),
            node: local_node_id(store.database()).await,
            seq: 1,
            rank: None,
            value: Value::Unsigned(12).to_cbor(),
        }]
    );
}

#[tokio::test]
async fn keeps_the_later_of_two_sets_under_the_next_sequence_number() {
    let folder = ScratchFolder::new("set-twice");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
    set_position(&store, book(1), 12).await.unwrap();

    set_position(&store, book(1), 13).await.unwrap();

    let stored = registers(&store).await;
    assert_eq!(
        stored
            .iter()
            .map(|register| (register.seq, register.value.clone()))
            .collect::<Vec<_>>(),
        [(2, Value::Unsigned(13).to_cbor())]
    );
}

#[tokio::test]
async fn clears_a_register_by_writing_null_over_it() {
    let folder = ScratchFolder::new("clear");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
    set_position(&store, book(1), 12).await.unwrap();

    store
        .write(|writer| writer.clear(LatestKey::BookPosition(book(1))))
        .await
        .unwrap();

    assert_eq!(values(&store).await, [Value::Null.to_cbor()]);
}

#[tokio::test]
async fn stamps_a_write_after_the_last_one_when_the_clock_goes_back() {
    let folder = ScratchFolder::new("clock-back");
    let clock = FakeClock::at(NOW_UNIX_MS);
    let store = open_store(&folder, clock.clone());
    set_position(&store, book(1), 12).await.unwrap();
    clock.set(NOW_UNIX_MS - 60_000);

    set_position(&store, book(2), 3).await.unwrap();

    assert_eq!(
        stamps(&store).await,
        [
            Hlc::new(NOW_UNIX_MS, 0).unwrap().as_u64(),
            Hlc::new(NOW_UNIX_MS, 1).unwrap().as_u64()
        ]
    );
}

#[tokio::test]
async fn carries_the_clock_and_sequence_on_after_the_library_reopens() {
    let folder = ScratchFolder::new("reopen");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
    set_position(&store, book(1), 12).await.unwrap();
    drop(store);
    let reopened = open_store(&folder, FakeClock::at(NOW_UNIX_MS));

    set_position(&reopened, book(2), 3).await.unwrap();

    let stored = registers(&reopened).await;
    assert_eq!(
        stored
            .iter()
            .map(|register| (register.hlc, register.seq))
            .collect::<Vec<_>>(),
        [
            (Hlc::new(NOW_UNIX_MS, 0).unwrap().as_u64(), 1),
            (Hlc::new(NOW_UNIX_MS, 1).unwrap().as_u64(), 2)
        ]
    );
}

#[tokio::test]
async fn leaves_no_register_behind_when_the_job_fails() {
    let folder = ScratchFolder::new("failed-job");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));

    let outcome = store
        .write(|writer| {
            writer.set(LatestKey::BookPosition(book(1)), Value::Unsigned(12))?;
            Err::<(), _>(Error::Closed)
        })
        .await;

    assert!(matches!(outcome, Err(Error::Closed)));
    assert!(registers(&store).await.is_empty());
}

async fn values(store: &Store) -> Vec<Vec<u8>> {
    registers(store)
        .await
        .into_iter()
        .map(|register| register.value)
        .collect()
}

fn open_store(folder: &ScratchFolder, clock: FakeClock) -> Store {
    Store::new(Database::open(&folder.config()).unwrap(), clock)
}

fn book(number: u32) -> BookId {
    let page = ImageEntry {
        crc32: number,
        size: 1,
    };
    BookId::local(&Fingerprint::pmf1([page]).unwrap())
}

async fn set_position(store: &Store, book: BookId, page: u64) -> Result<(), Error> {
    store
        .write(move |writer| writer.set(LatestKey::BookPosition(book), Value::Unsigned(page)))
        .await
}

async fn local_node_id(database: &Database) -> [u8; 16] {
    database
        .read(|connection| {
            Ok(connection.query_row("SELECT node_id FROM sync_local", [], |row| row.get(0))?)
        })
        .await
        .unwrap()
}

async fn stamps(store: &Store) -> Vec<u64> {
    let mut stamps: Vec<u64> = registers(store)
        .await
        .iter()
        .map(|register| register.hlc)
        .collect();
    stamps.sort_unstable();
    stamps
}

async fn registers(store: &Store) -> Vec<StoredRegister> {
    store
        .database()
        .read(|connection| {
            let mut statement = connection.prepare(
                "SELECT entity, field, class, hlc, node, seq, rank, value
                 FROM sync_register ORDER BY seq",
            )?;
            let rows = statement.query_map([], |row| {
                Ok(StoredRegister {
                    entity: row.get(0)?,
                    field: row.get(1)?,
                    class: row.get(2)?,
                    hlc: row.get(3)?,
                    node: row.get(4)?,
                    seq: row.get(5)?,
                    rank: row.get(6)?,
                    value: row.get(7)?,
                })
            })?;
            Ok(rows.collect::<Result<_, _>>()?)
        })
        .await
        .unwrap()
}
