//! The sync contract shared by every device and the sync server: stable ids, content fingerprints and the hybrid logical clock.

mod id;
mod norm;

pub use id::{CategoryId, IdError, KeyError, SeriesId};
pub use norm::norm;
