//! The single write path for synced state, where every change is a register write stamped by this device's clock.

mod key;
mod local;
mod register;
mod writer;

use std::sync::Arc;

pub use key::{LatestKey, MaximumKey};
pub use writer::Writer;

use crate::{Database, Error};

pub trait Clock: Send + Sync + 'static {
    /// Milliseconds since the Unix epoch, free to jump backwards since stamps never do.
    fn now_unix_ms(&self) -> u64;
}

pub struct Store {
    database: Database,
    clock: Arc<dyn Clock>,
}

impl Store {
    #[must_use]
    pub fn new(database: Database, clock: impl Clock) -> Self {
        Self {
            database,
            clock: Arc::new(clock),
        }
    }

    #[must_use]
    pub const fn database(&self) -> &Database {
        &self.database
    }

    /// Runs the job in one transaction that commits only when it succeeds, stamping each write later than every earlier one.
    pub fn write<T, F>(&self, job: F) -> impl Future<Output = Result<T, Error>> + use<T, F>
    where
        T: Send + 'static,
        F: FnOnce(&mut Writer<'_>) -> Result<T, Error> + Send + 'static,
    {
        let clock = Arc::clone(&self.clock);
        self.database.write(move |transaction| {
            let mut writer = Writer::begin(transaction, clock.now_unix_ms())?;
            let value = job(&mut writer)?;
            writer.finish()?;
            Ok(value)
        })
    }
}
