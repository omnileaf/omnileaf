use std::io;

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("libarchive could not start within its memory budget")]
    Unavailable,
    #[error("libarchive needed more than its {limit_bytes} byte memory budget")]
    BudgetExceeded { limit_bytes: usize },
    #[error("libarchive: {message}")]
    Archive { message: String },
    #[error("reading the archive source: {0}")]
    Source(#[from] io::Error),
}
