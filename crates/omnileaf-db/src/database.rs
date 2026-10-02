use rusqlite::{Connection, Transaction, TransactionBehavior};

use crate::{Config, Error, connection, workers::ConnectionWorkers};

const READER_COUNT: usize = 3;

/// Dropping it blocks until every job already submitted has run.
pub struct Database {
    /// Declared before the writer so the readers close first, leaving the writer to checkpoint the log.
    readers: ConnectionWorkers,
    writer: ConnectionWorkers,
}

impl Database {
    pub fn open(config: &Config) -> Result<Self, Error> {
        let writer = connection::open_writer(config)?;
        let readers = (0..READER_COUNT)
            .map(|_| connection::open_reader(config))
            .collect::<Result<_, _>>()?;
        Ok(Self {
            writer: ConnectionWorkers::spawn("omnileaf-db-writer", vec![writer])?,
            readers: ConnectionWorkers::spawn("omnileaf-db-reader", readers)?,
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

    pub fn read<T, F>(&self, job: F) -> impl Future<Output = Result<T, Error>> + use<T, F>
    where
        T: Send + 'static,
        F: FnOnce(&Connection) -> Result<T, Error> + Send + 'static,
    {
        self.readers.submit(move |connection| job(connection))
    }
}
