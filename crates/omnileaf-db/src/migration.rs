use std::path::Path;

use rusqlite::{Connection, TransactionBehavior};

use crate::Error;

const EMPTY_SCHEMA: u32 = 0;

const SCHEMA_VERSION: &str = "user_version";

pub(crate) enum Pending {
    Current,
    NewDatabase,
    Upgrade { from: u32 },
}

pub(crate) struct Migration {
    pub(crate) name: &'static str,
    pub(crate) sql: &'static str,
}

macro_rules! migration {
    ($name:literal) => {
        Migration {
            name: $name,
            sql: include_str!(concat!("../migrations/", $name, ".sql")),
        }
    };
}

/// Applied in order, and never edited once released; schema version N means the first N have run.
pub(crate) const MIGRATIONS: &[Migration] = &[migration!("0001_mark_omnileaf_library")];

pub(crate) fn pending(
    connection: &Connection,
    path: &Path,
    migrations: &[Migration],
) -> Result<Pending, Error> {
    let found = schema_version(connection).map_err(|source| Error::Open {
        path: path.to_owned(),
        source,
    })?;
    let supported = supported_version(found, migrations)?;
    Ok(if found == supported {
        Pending::Current
    } else if found == EMPTY_SCHEMA {
        Pending::NewDatabase
    } else {
        Pending::Upgrade { from: found }
    })
}

/// Reads the schema version again inside the write lock, so migrations another connection applied meanwhile are skipped.
pub(crate) fn apply(
    connection: &mut Connection,
    path: &Path,
    migrations: &[Migration],
) -> Result<(), Error> {
    let upgrade_failed = |source| Error::Upgrade {
        path: path.to_owned(),
        version: latest_version(migrations),
        source,
    };
    let transaction = connection
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(upgrade_failed)?;
    let from = schema_version(&transaction).map_err(upgrade_failed)?;
    let latest = supported_version(from, migrations)?;
    for (_, migration) in numbered(migrations).filter(|(version, _)| *version > from) {
        transaction
            .execute_batch(migration.sql)
            .map_err(|source| Error::Migrate {
                name: migration.name,
                source,
            })?;
        tracing::info!(migration = migration.name, "applied a database migration");
    }
    transaction
        .pragma_update(None, SCHEMA_VERSION, latest)
        .and_then(|()| transaction.commit())
        .map_err(upgrade_failed)
}

fn schema_version(connection: &Connection) -> rusqlite::Result<u32> {
    connection.pragma_query_value(None, SCHEMA_VERSION, |row| row.get(0))
}

fn supported_version(found: u32, migrations: &[Migration]) -> Result<u32, Error> {
    let supported = latest_version(migrations);
    if found > supported {
        return Err(Error::NewerSchema { found, supported });
    }
    Ok(supported)
}

fn numbered(migrations: &[Migration]) -> impl Iterator<Item = (u32, &Migration)> {
    (1..).zip(migrations)
}

fn latest_version(migrations: &[Migration]) -> u32 {
    numbered(migrations)
        .last()
        .map_or(EMPTY_SCHEMA, |(version, _)| version)
}

#[cfg(test)]
mod tests {
    use std::{fs, path::Path};

    use super::*;
    use crate::{Database, connection, scratch::ScratchLibrary};

    type Schema = (i64, i64, Vec<(String, String, Option<String>)>);

    #[test]
    fn brings_a_new_database_to_the_latest_schema_version() {
        let scratch = ScratchLibrary::new("latest");

        drop(Database::open(&scratch.config).unwrap());

        let (version, _, _) = schema_of(&scratch.config.path);
        assert_eq!(usize::try_from(version).unwrap(), MIGRATIONS.len());
    }

    #[test]
    fn every_earlier_schema_version_migrates_to_the_schema_a_new_database_gets() {
        let fresh = ScratchLibrary::new("fresh");
        drop(Database::open(&fresh.config).unwrap());
        let expected = schema_of(&fresh.config.path);

        for version in 0..MIGRATIONS.len() {
            let earlier = ScratchLibrary::new("earlier");
            drop(Database::open_with(&earlier.config, &MIGRATIONS[..version]).unwrap());

            drop(Database::open(&earlier.config).unwrap());

            let backup = earlier.backup_path(u32::try_from(version).unwrap());
            assert_eq!(
                schema_of(&earlier.config.path),
                expected,
                "from version {version}"
            );
            assert_eq!(backup.exists(), version > 0, "backup of version {version}");
        }
    }

    #[test]
    fn numbers_each_migration_by_its_schema_version() {
        for (version, migration) in numbered(MIGRATIONS) {
            let prefix = format!("{version:04}_");

            let is_numbered = migration.name.starts_with(&prefix);

            assert!(is_numbered, "{} should start with {prefix}", migration.name);
        }
    }

    #[test]
    fn lists_every_migration_file() {
        let folder = concat!(env!("CARGO_MANIFEST_DIR"), "/migrations");

        let mut files: Vec<String> = fs::read_dir(folder)
            .unwrap()
            .map(|entry| entry.unwrap().path())
            .filter(|path| path.extension().is_some_and(|extension| extension == "sql"))
            .map(|path| path.file_stem().unwrap().to_string_lossy().into_owned())
            .collect();
        files.sort();

        let listed: Vec<&str> = MIGRATIONS.iter().map(|migration| migration.name).collect();
        assert_eq!(files, listed);
    }

    #[test]
    fn keeps_the_earlier_schema_when_a_migration_fails() {
        let scratch = ScratchLibrary::new("failed");
        let broken = [
            Migration {
                name: "0001_create_note",
                sql: "CREATE TABLE note (id INTEGER PRIMARY KEY);",
            },
            Migration {
                name: "0002_break",
                sql: "CREATE TABLE note (id INTEGER PRIMARY KEY);",
            },
        ];

        let outcome = Database::open_with(&scratch.config, &broken);

        assert!(matches!(
            outcome,
            Err(Error::Migrate {
                name: "0002_break",
                ..
            })
        ));
        assert_eq!(schema_of(&scratch.config.path), (0, 0, Vec::new()));
    }

    #[test]
    fn skips_the_migrations_another_connection_applied_since_the_version_was_read() {
        let scratch = ScratchLibrary::new("raced");
        let tally = [
            Migration {
                name: "0001_create_tally",
                sql: "CREATE TABLE tally (count INTEGER NOT NULL); INSERT INTO tally (count) VALUES (1);",
            },
            Migration {
                name: "0002_scale_tally",
                sql: "UPDATE tally SET count = count * 1000;",
            },
        ];
        drop(Database::open_with(&scratch.config, &tally[..1]).unwrap());
        let mut stale = connection::open_writer(&scratch.config).unwrap();
        let Pending::Upgrade { .. } = pending(&stale, &scratch.config.path, &tally).unwrap() else {
            panic!("the database should be waiting for its second migration");
        };
        drop(Database::open_with(&scratch.config, &tally).unwrap());

        apply(&mut stale, &scratch.config.path, &tally).unwrap();

        let count: i64 = stale
            .query_row("SELECT count FROM tally", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1000);
    }

    fn schema_of(path: &Path) -> Schema {
        let connection = Connection::open(path).unwrap();
        let pragma = |name| connection.pragma_query_value(None, name, |row| row.get(0));
        let mut statement = connection
            .prepare("SELECT type, name, sql FROM sqlite_schema ORDER BY type, name")
            .unwrap();
        let objects = statement
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        (
            pragma("user_version").unwrap(),
            pragma("application_id").unwrap(),
            objects,
        )
    }
}
