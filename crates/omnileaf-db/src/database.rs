use rusqlite::{Connection, Transaction, TransactionBehavior};

use crate::{
    Config, Error, connection,
    migration::{self, MIGRATIONS, Migration},
    workers::ConnectionWorkers,
};

const READER_COUNT: usize = 3;

/// Dropping it blocks until every job already submitted has run.
pub struct Database {
    /// Declared before the writer so the readers close first, leaving the writer to checkpoint the log.
    readers: ConnectionWorkers,
    writer: ConnectionWorkers,
}

impl Database {
    /// Blocks while it opens the file and brings its schema up to date, so call it off the async runtime.
    pub fn open(config: &Config) -> Result<Self, Error> {
        Self::open_with(config, MIGRATIONS)
    }

    #[tracing::instrument(skip_all, fields(path = %config.path.display()))]
    pub(crate) fn open_with(config: &Config, migrations: &[Migration]) -> Result<Self, Error> {
        let mut writer = connection::open_writer(config)?;
        if let Some(from) = migration::pending_from(&writer, migrations)? {
            migration::apply(&mut writer, migrations, from)?;
        }
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
