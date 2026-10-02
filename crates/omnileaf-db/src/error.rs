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
    #[error("start a database thread")]
    Spawn(#[source] io::Error),
    #[error("run a statement in a database job")]
    Statement(#[from] rusqlite::Error),
    #[error("the database closed before the job ran")]
    Closed,
}
