//! A folder of derived files, such as thumbnails, kept under a byte budget by dropping the least recently used.

mod disk_cache;
mod error;
mod key;
mod recency;

pub use disk_cache::DiskCache;
pub use error::CacheError;
pub use key::CacheKey;
