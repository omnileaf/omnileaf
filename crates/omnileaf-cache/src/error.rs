use std::{io, path::PathBuf};

use crate::CacheKey;

#[derive(Debug, thiserror::Error)]
pub enum CacheError {
    #[error("open the cache folder {}", path.display())]
    Open {
        path: PathBuf,
        #[source]
        source: io::Error,
    },
    #[error("read cache entry {key}")]
    Read {
        key: CacheKey,
        #[source]
        source: io::Error,
    },
    #[error("write cache entry {key}")]
    Write {
        key: CacheKey,
        #[source]
        source: io::Error,
    },
    #[error("use {text:?} as a cache key, which isn't 1 to {max} lowercase letters, digits and hyphens", max = CacheKey::MAX_LENGTH)]
    MalformedKey { text: String },
}
