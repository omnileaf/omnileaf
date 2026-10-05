use rusqlite::{Connection, Transaction, TransactionBehavior};

use crate::{
    Config, Error, backup,
    checkpoint::{Checkpointer, hand_checkpoints_over},
    connection,
    migration::{self, MIGRATIONS, Migration, Pending},
    title_key::keep_titles_sorted,
    workers::ConnectionWorkers,
};

const READER_COUNT: usize = 3;

/// Dropping it blocks until every job already submitted has run.
pub struct Database {
    /// Declared before the writer and the checkpointer so the readers close first and the checkpointer last, leaving it to checkpoint and remove the log.
    readers: ConnectionWorkers,
    writer: ConnectionWorkers,
    checkpointer: Checkpointer,
}

impl Database {
    /// Blocks while it opens the file, brings its schema up to date and re-keys titles made by another build, so call it off the async runtime.
    #[tracing::instrument(skip_all, fields(path = %config.path.display()))]
    pub fn open(config: &Config) -> Result<Self, Error> {
        let mut writer = migrated_writer(config, MIGRATIONS)?;
        let transaction = writer.transaction_with_behavior(TransactionBehavior::Immediate)?;
        keep_titles_sorted(&transaction)?;
        transaction.commit()?;
        Self::serve(config, writer)
    }

    #[cfg(test)]
    #[tracing::instrument(skip_all, fields(path = %config.path.display()))]
    pub(crate) fn open_with(config: &Config, migrations: &[Migration]) -> Result<Self, Error> {
        Self::serve(config, migrated_writer(config, migrations)?)
    }

    fn serve(config: &Config, writer: Connection) -> Result<Self, Error> {
        let readers = (0..READER_COUNT)
            .map(|_| connection::open_reader(config))
            .collect::<Result<_, _>>()?;
        let checkpointer = Checkpointer::spawn(connection::open_writer(config)?)?;
        hand_checkpoints_over(&writer);
        Ok(Self {
            writer: ConnectionWorkers::spawn("omnileaf-db-writer", vec![writer])?,
            readers: ConnectionWorkers::spawn("omnileaf-db-reader", readers)?,
            checkpointer,
        })
    }

    /// Runs the job in one immediate transaction on the writer thread, committing only when it succeeds.
    pub fn write<T, F>(&self, job: F) -> impl Future<Output = Result<T, Error>> + use<T, F>
    where
        T: Send + 'static,
        F: FnOnce(&Transaction<'_>) -> Result<T, Error> + Send + 'static,
    {
        self.write_then(job, |_| {})
    }

    /// Runs `committed` on the writer thread straight after the commit, so whatever it announces is already durable.
    pub(crate) fn write_then<T, F, C>(
        &self,
        job: F,
        committed: C,
    ) -> impl Future<Output = Result<T, Error>> + use<T, F, C>
    where
        T: Send + 'static,
        F: FnOnce(&Transaction<'_>) -> Result<T, Error> + Send + 'static,
        C: FnOnce(&T) + Send + 'static,
    {
        let checkpoints = self.checkpointer.requests();
        self.writer.submit(move |connection| {
            let transaction =
                connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
            let value = job(&transaction)?;
            transaction.commit()?;
            checkpoints.request_if_due();
            committed(&value);
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

fn migrated_writer(config: &Config, migrations: &[Migration]) -> Result<Connection, Error> {
    let mut writer = connection::open_writer(config)?;
    match migration::pending(&writer, &config.path, migrations)? {
        Pending::Current => {}
        Pending::NewDatabase => {
            migration::apply(&mut writer, &config.path, migrations)?;
        }
        Pending::Upgrade { from } => {
            backup::back_up(&writer, &config.backup_dir, from)?;
            migration::apply(&mut writer, &config.path, migrations)?;
        }
    }
    Ok(writer)
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

    const SERIES_AND_BOOKS: Migration = Migration {
        name: "0001_create_series_and_book",
        sql: "CREATE TABLE series (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
              CREATE TABLE book (
                  id INTEGER PRIMARY KEY,
                  series_id INTEGER NOT NULL REFERENCES series (id) ON DELETE CASCADE
              );
              INSERT INTO series (id, name) VALUES (1, 'Sample Series 01');
              INSERT INTO book (id, series_id) VALUES (1, 1), (2, 1);",
    };
    const REBUILD_SERIES: Migration = Migration {
        name: "0002_rebuild_series",
        sql: "CREATE TABLE series_new (id INTEGER PRIMARY KEY, name TEXT NOT NULL, sort_name TEXT);
              INSERT INTO series_new (id, name) SELECT id, name FROM series;
              DROP TABLE series;
              ALTER TABLE series_new RENAME TO series;",
    };
    const ORPHAN_BOOK: Migration = Migration {
        name: "0002_add_orphan_book",
        sql: "INSERT INTO book (id, series_id) VALUES (3, 99);",
    };

    #[test]
    fn keeps_child_rows_when_a_migration_rebuilds_the_table_they_reference() {
        let scratch = ScratchLibrary::new("rebuild");
        drop(Database::open_with(&scratch.config, &[SERIES_AND_BOOKS]).unwrap());

        drop(Database::open_with(&scratch.config, &[SERIES_AND_BOOKS, REBUILD_SERIES]).unwrap());

        assert_eq!(book_ids(&scratch), [1, 2]);
    }

    #[test]
    fn refuses_a_migration_that_leaves_a_reference_dangling() {
        let scratch = ScratchLibrary::new("dangling");
        drop(Database::open_with(&scratch.config, &[SERIES_AND_BOOKS]).unwrap());

        let outcome = Database::open_with(&scratch.config, &[SERIES_AND_BOOKS, ORPHAN_BOOK]);

        assert!(matches!(
            outcome,
            Err(Error::DanglingReference { table, .. }) if table == "book"
        ));
        assert_eq!(book_ids(&scratch), [1, 2]);
    }

    #[test]
    fn backs_up_an_existing_database_before_migrating_it() {
        let scratch = ScratchLibrary::new("backup");
        drop(Database::open_with(&scratch.config, &[NOTES]).unwrap());

        drop(Database::open_with(&scratch.config, &[NOTES, PINNED]).unwrap());

        assert_eq!(backup(&scratch, 1), (1, vec!["kept".to_owned()]));
    }

    #[test]
    fn replaces_the_backup_when_a_failed_migration_is_retried() {
        let scratch = ScratchLibrary::new("retry");
        drop(Database::open_with(&scratch.config, &[NOTES]).unwrap());
        let failed = Database::open_with(&scratch.config, &[NOTES, BROKEN]);
        Connection::open(&scratch.config.path)
            .unwrap()
            .execute("INSERT INTO note (body) VALUES ('newer')", [])
            .unwrap();

        let retried = Database::open_with(&scratch.config, &[NOTES, PINNED]);

        assert!(matches!(
            failed,
            Err(Error::Migrate {
                name: "0002_break",
                ..
            })
        ));
        assert!(retried.is_ok());
        assert_eq!(
            backup(&scratch, 1),
            (1, vec!["kept".to_owned(), "newer".to_owned()])
        );
    }

    fn book_ids(scratch: &ScratchLibrary) -> Vec<i64> {
        let connection = Connection::open(&scratch.config.path).unwrap();
        let mut statement = connection
            .prepare("SELECT id FROM book ORDER BY id")
            .unwrap();
        statement
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap()
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
        let mut statement = connection
            .prepare("SELECT body FROM note ORDER BY rowid")
            .unwrap();
        let notes = statement
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        (version, notes)
    }
}
