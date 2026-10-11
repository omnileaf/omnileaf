mod key;
mod local;
mod projector;
mod reading_state;
mod register;
mod writer;

use std::{collections::BTreeSet, sync::Arc};

pub use key::{Key, LatestKey, MaximumKey};
pub use reading_state::{ReadingState, reading_state};
use tokio::sync::broadcast;
pub use writer::Writer;

use crate::{
    Database, Error, Language,
    title_key::{Resorted, sort_titles_for},
};

const CHANGE_BACKLOG: usize = 64;

pub trait Clock: Send + Sync + 'static {
    /// The wall clock can jump backwards, which the stamps never do.
    fn now_unix_ms(&self) -> u64;
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Changed {
    Registers { keys: BTreeSet<Key> },
    TitleOrder,
}

impl Changed {
    fn is_empty(&self) -> bool {
        match self {
            Self::Registers { keys } => keys.is_empty(),
            Self::TitleOrder => false,
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

    #[must_use]
    pub fn clock(&self) -> &dyn Clock {
        self.clock.as_ref()
    }

    /// A tokio broadcast receiver that falls too far behind loses the oldest changes and is told how many it missed.
    #[must_use]
    pub fn subscribe(&self) -> broadcast::Receiver<Changed> {
        self.subscribers.subscribe()
    }

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

    pub fn rebuild_projections(&self) -> impl Future<Output = Result<(), Error>> + use<> {
        let subscribers = self.subscribers.clone();
        let rebuilt = self.database.write_then(
            |transaction| projector::rebuild(transaction),
            move |changed| announce(&subscribers, changed),
        );
        async move { rebuilt.await.map(drop) }
    }

    pub fn sort_titles_for(
        &self,
        language: Language,
    ) -> impl Future<Output = Result<(), Error>> + use<> {
        let subscribers = self.subscribers.clone();
        let sorted = self.database.write_then(
            move |transaction| sort_titles_for(transaction, &language),
            move |resorted| match resorted {
                Resorted::Rekeyed => announce(&subscribers, &Changed::TitleOrder),
                Resorted::Unchanged => {}
            },
        );
        async move { sorted.await.map(drop) }
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
