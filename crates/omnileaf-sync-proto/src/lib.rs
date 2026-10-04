//! The sync contract shared by every device and the sync server: stable ids, content fingerprints and the hybrid logical clock.

mod clock;
mod fingerprint;
mod id;
mod norm;

pub use clock::{ClockError, Hlc};
pub use fingerprint::{
    Fingerprint, FingerprintError, FingerprintKind, FolderImage, FolderManifest, ImageEntry,
    RAW1_SAMPLE_COUNT,
};
pub use id::{BookId, CategoryId, IdError, KeyError, SeriesId};
pub use norm::norm;
