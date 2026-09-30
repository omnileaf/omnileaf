use std::{io, path::PathBuf};

#[derive(Debug, thiserror::Error)]
pub enum FixtureError {
    #[error("write {}", path.display())]
    Write { path: PathBuf, source: io::Error },
    #[error("encode a page")]
    Page(#[from] png::EncodingError),
    #[error("build an archive")]
    Archive(#[from] zip::result::ZipError),
}
