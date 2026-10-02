use rusqlite::{Connection, Transaction, TransactionBehavior};

use crate::{
    Config, Error, backup, connection,
    migration::{self, MIGRATIONS, Migration, Pending},
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
        match migration::pending(&writer, migrations)? {
            Pending::Current => {}
            Pending::NewDatabase => {
                migration::apply(&mut writer, migrations)?;
            }
            Pending::Upgrade { from } => {
                backup::back_up(&writer, &config.backup_dir, from)?;
                migration::apply(&mut writer, migrations)?;
            }
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

#[cfg(test)]
mod tests {
    use rusqlite::OpenFlags;

    use super::*;
    use crate::scratch::ScratchLibrary;

    const NOTES: Migration = Migration {
        name: "0001_create_note",
        sql: "CREATE TABLE note (body TEXT NOT NULL); INSERT INTO note (body) VALUES ('kept');",
    };
    const PINNED: Migration = Migration {
        name: "0002_add_note_pinned",
        sql: "ALTER TABLE note ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;",
    };
    const BROKEN: Migration = Migration {
        name: "0002_break",
        sql: "ALTER TABLE missing ADD COLUMN pinned INTEGER;",
    };

    #[test]
    fn backs_up_an_existing_database_before_migrating_it() {
        let scratch = ScratchLibrary::new("backup");
        drop(Database::open_with(&scratch.config, &[NOTES]).unwrap());

        drop(Database::open_with(&scratch.config, &[NOTES, PINNED]).unwrap());

        assert_eq!(backup(&scratch, 1), (1, vec!["kept".to_owned()]));
    }

    #[test]
    fn backs_up_again_when_a_failed_migration_is_retried() {
        let scratch = ScratchLibrary::new("retry");
        drop(Database::open_with(&scratch.config, &[NOTES]).unwrap());
        let failed = Database::open_with(&scratch.config, &[NOTES, BROKEN]);

        let retried = Database::open_with(&scratch.config, &[NOTES, PINNED]);

        assert!(matches!(
            failed,
            Err(Error::Migrate {
                name: "0002_break",
                ..
            })
        ));
        assert!(retried.is_ok());
        assert_eq!(backup(&scratch, 1), (1, vec!["kept".to_owned()]));
    }

    fn backup(scratch: &ScratchLibrary, schema_version: u32) -> (u32, Vec<String>) {
        let connection = Connection::open_with_flags(
            scratch.backup_path(schema_version),
            OpenFlags::SQLITE_OPEN_READ_ONLY,
        )
        .unwrap();
        let version = connection
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .unwrap();
        let mut statement = connection.prepare("SELECT body FROM note").unwrap();
        let notes = statement
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        (version, notes)
    }
}
