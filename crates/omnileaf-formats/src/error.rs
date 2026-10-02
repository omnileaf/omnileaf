use std::{io, path::PathBuf};

use crate::ComicInfoError;

#[derive(Debug, thiserror::Error)]
pub enum FormatError {
    #[error("read {}", path.display())]
    Read { path: PathBuf, source: io::Error },
    #[error("{} isn't a comic archive or folder this app can read", path.display())]
    Unsupported { path: PathBuf },
    #[error("{} is damaged", path.display())]
    Corrupt {
        path: PathBuf,
        source: zip::result::ZipError,
    },
    #[error("{} has no pages", path.display())]
    NoPages { path: PathBuf },
    #[error("{} has {count} entries, more than the {limit} allowed", path.display())]
    TooManyEntries {
        path: PathBuf,
        count: usize,
        limit: usize,
    },
    #[error("page {name} in {} is larger than the {limit} bytes allowed", path.display())]
    PageTooLarge {
        path: PathBuf,
        name: String,
        limit: u64,
    },
    #[error("{} holds more than the {limit} bytes allowed in total", path.display())]
    TooLargeInTotal { path: PathBuf, limit: u64 },
    #[error("page {name} in {} expands suspiciously far", path.display())]
    SuspiciousCompression { path: PathBuf, name: String },
    #[error("{} has no page {index}", path.display())]
    NoSuchPage { path: PathBuf, index: usize },
    #[error("the ComicInfo in {} is larger than the {limit} bytes allowed", path.display())]
    ComicInfoTooLarge { path: PathBuf, limit: u64 },
    #[error("read the ComicInfo in {}", path.display())]
    BadComicInfo {
        path: PathBuf,
        source: ComicInfoError,
    },
}
