use std::{io, path::PathBuf};

use omnileaf_sync_proto::SeriesId;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("open database {}", path.display())]
    Open {
        path: PathBuf,
        source: rusqlite::Error,
    },
    #[error("database {} stayed in {mode} journal mode instead of write-ahead logging", path.display())]
    NoWriteAheadLog { path: PathBuf, mode: String },
    #[error("database schema version {found} is newer than version {supported} this build knows")]
    NewerSchema { found: u32, supported: u32 },
    #[error("back up the database to {}", path.display())]
    Backup {
        path: PathBuf,
        source: rusqlite::Error,
    },
    #[error("store the database backup at {}", path.display())]
    BackupFile { path: PathBuf, source: io::Error },
    #[error("backup path {} isn't valid Unicode", path.display())]
    BackupPathNotUnicode { path: PathBuf },
    #[error("apply migration {name}")]
    Migrate {
        name: &'static str,
        source: rusqlite::Error,
    },
    #[error("bring database {} up to schema version {version}", path.display())]
    Upgrade {
        path: PathBuf,
        version: u32,
        source: rusqlite::Error,
    },
    #[error("migrating database {} left rows in {table} referring to missing rows", path.display())]
    DanglingReference { path: PathBuf, table: String },
    #[error("add a book to series {id}, which isn't in the catalog")]
    UnknownSeries { id: SeriesId },
    #[error("ask for a page of {requested} items, outside the 1 to {max} a page holds")]
    PageSize { requested: u16, max: u16 },
    #[error("read a page cursor that isn't one the library gave out")]
    MalformedCursor,
    #[error("start a database thread")]
    Spawn(#[source] io::Error),
    #[error("run a statement in a database job")]
    Statement(#[from] rusqlite::Error),
    #[error("a database job panicked")]
    JobPanicked,
    #[error("the database closed before the job ran")]
    Closed,
}
