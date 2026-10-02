use std::{io, path::PathBuf};

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
    #[error("apply migration {name}")]
    Migrate {
        name: &'static str,
        source: rusqlite::Error,
    },
    #[error("start a database thread")]
    Spawn(#[source] io::Error),
    #[error("run a statement in a database job")]
    Statement(#[from] rusqlite::Error),
    #[error("a database job panicked")]
    JobPanicked,
    #[error("the database closed before the job ran")]
    Closed,
}
