//! The single write path for synced state, where every change is a register write stamped by this device's clock.

mod key;
mod local;
mod projector;
mod register;
mod writer;

use std::{collections::BTreeSet, sync::Arc};

pub use key::{Key, LatestKey, MaximumKey};
use tokio::sync::broadcast;
pub use writer::Writer;

use crate::{Database, Error};

const CHANGE_BACKLOG: usize = 64;

pub trait Clock: Send + Sync + 'static {
    /// Milliseconds since the Unix epoch, free to jump backwards since stamps never do.
    fn now_unix_ms(&self) -> u64;
}

/// What one committed write changed.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Changed {
    Registers { keys: BTreeSet<Key> },
}

impl Changed {
    fn is_empty(&self) -> bool {
        match self {
            Self::Registers { keys } => keys.is_empty(),
        }
    }
}

pub struct Store {
    database: Database,
    clock: Arc<dyn Clock>,
    subscribers: broadcast::Sender<Changed>,
}

impl Store {
    #[must_use]
    pub fn new(database: Database, clock: impl Clock) -> Self {
        Self {
            database,
            clock: Arc::new(clock),
            subscribers: broadcast::Sender::new(CHANGE_BACKLOG),
        }
    }

    #[must_use]
    pub const fn database(&self) -> &Database {
        &self.database
    }

    /// A receiver that falls too far behind loses the oldest changes and is told how many it missed.
    #[must_use]
    pub fn subscribe(&self) -> broadcast::Receiver<Changed> {
        self.subscribers.subscribe()
    }

    /// Runs the job in one transaction that commits only when it and every write it made succeed, stamping each write later than every earlier one.
    pub fn write<T, F>(&self, job: F) -> impl Future<Output = Result<T, Error>> + use<T, F>
    where
        T: Send + 'static,
        F: FnOnce(&mut Writer<'_>) -> Result<T, Error> + Send + 'static,
    {
        let clock = Arc::clone(&self.clock);
        let subscribers = self.subscribers.clone();
        let written = self.database.write_then(
            move |transaction| {
                let mut writer = Writer::begin(transaction, clock.now_unix_ms())?;
                let value = job(&mut writer)?;
                let changed = writer.finish()?;
                Ok((value, changed))
            },
            move |(_, changed)| announce(&subscribers, changed),
        );
        async move { Ok(written.await?.0) }
    }

    /// Recomputes every projection from the registers alone, in one transaction, and announces every key it projected.
    pub fn rebuild_projections(&self) -> impl Future<Output = Result<(), Error>> + use<> {
        let subscribers = self.subscribers.clone();
        let rebuilt = self.database.write_then(
            |transaction| projector::rebuild(transaction),
            move |changed| announce(&subscribers, changed),
        );
        async move { rebuilt.await.map(drop) }
    }
}

fn announce(subscribers: &broadcast::Sender<Changed>, changed: &Changed) {
    if changed.is_empty() {
        return;
    }
    if subscribers.send(changed.clone()).is_err() {
        tracing::trace!("no one is listening for synced changes");
    }
}
