use std::time::Duration;

use rusqlite::{Connection, OpenFlags};

use crate::{Config, Error};

const BUSY_TIMEOUT: Duration = Duration::from_secs(5);
const WRITE_AHEAD_LOG: &str = "wal";

pub(crate) fn open_writer(config: &Config) -> Result<Connection, Error> {
    let connection = open(config, OpenFlags::default())?;
    let mode = configure_writing(&connection).map_err(|source| open_failed(config, source))?;
    if !mode.eq_ignore_ascii_case(WRITE_AHEAD_LOG) {
        return Err(Error::NoWriteAheadLog {
            path: config.path.clone(),
            mode,
        });
    }
    Ok(connection)
}

pub(crate) fn open_reader(config: &Config) -> Result<Connection, Error> {
    open(
        config,
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
}

fn open(config: &Config, flags: OpenFlags) -> Result<Connection, Error> {
    Connection::open_with_flags(&config.path, flags)
        .and_then(|connection| {
            configure(&connection, config)?;
            Ok(connection)
        })
        .map_err(|source| open_failed(config, source))
}

fn configure(connection: &Connection, config: &Config) -> rusqlite::Result<()> {
    connection.busy_timeout(BUSY_TIMEOUT)?;
    connection.pragma_update(None, "foreign_keys", true)?;
    connection.pragma_update(None, "mmap_size", i64::from(config.mmap_size_bytes))
}

/// Returns the journal mode SQLite settled on, which stays as it was where the file system can't hold a write-ahead log.
fn configure_writing(connection: &Connection) -> rusqlite::Result<String> {
    connection.pragma_update(None, "synchronous", "NORMAL")?;
    connection.pragma_update_and_check(None, "journal_mode", WRITE_AHEAD_LOG, |row| row.get(0))
}

fn open_failed(config: &Config, source: rusqlite::Error) -> Error {
    Error::Open {
        path: config.path.clone(),
        source,
    }
}
