#![expect(
    clippy::unwrap_used,
    reason = "the store is test set-up, so a failure should stop the test"
)]

use std::sync::{
    Arc,
    atomic::{AtomicU64, Ordering},
};

use omnileaf_db::{
    Database, Error,
    store::{Clock, Store},
};
use omnileaf_sync_proto::{BookId, Fingerprint, ImageEntry};

use crate::support::ScratchFolder;

pub(crate) const NOW_UNIX_MS: u64 = 1_790_000_000_000;

#[derive(Clone)]
pub(crate) struct FakeClock(Arc<AtomicU64>);

impl FakeClock {
    pub(crate) fn at(unix_ms: u64) -> Self {
        let clock = Self(Arc::new(AtomicU64::new(0)));
        clock.set(unix_ms);
        clock
    }

    pub(crate) fn set(&self, unix_ms: u64) {
        self.0.store(unix_ms, Ordering::Relaxed);
    }
}

impl Clock for FakeClock {
    fn now_unix_ms(&self) -> u64 {
        self.0.load(Ordering::Relaxed)
    }
}

pub(crate) fn open_store(folder: &ScratchFolder, clock: FakeClock) -> Store {
    Store::new(Database::open(&folder.config()).unwrap(), clock)
}

pub(crate) fn book(number: u32) -> BookId {
    let page = ImageEntry {
        crc32: number,
        size: 1,
    };
    BookId::local(&Fingerprint::pmf1([page]).unwrap())
}

pub(crate) async fn set_position(store: &Store, book: BookId, page: u32) -> Result<(), Error> {
    store
        .write(move |writer| writer.set_position(book, page))
        .await
}

pub(crate) async fn raise_furthest(store: &Store, book: BookId, page: u32) {
    store
        .write(move |writer| writer.raise_furthest(book, page))
        .await
        .unwrap();
}
