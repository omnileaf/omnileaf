use rusqlite::{Transaction, TransactionBehavior};

use crate::{Config, Error, connection, workers::ConnectionWorkers};

/// Dropping it blocks until every job already submitted has run.
pub struct Database {
    writer: ConnectionWorkers,
}

impl Database {
    pub fn open(config: &Config) -> Result<Self, Error> {
        let writer = connection::open_writer(config)?;
        Ok(Self {
            writer: ConnectionWorkers::spawn("omnileaf-db-writer", vec![writer])?,
        })
    }

    /// Runs the job in one immediate transaction on the writer thread, committing only when it succeeds.
    pub fn write<T, F>(&self, job: F) -> impl Future<Output = Result<T, Error>> + use<T, F>
    where
        T: Send + 'static,
        F: FnOnce(&Transaction<'_>) -> Result<T, Error> + Send + 'static,
    {
        self.writer.submit(move |connection| {
            let transaction =
                connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
            let value = job(&transaction)?;
            transaction.commit()?;
            Ok(value)
        })
    }
}
