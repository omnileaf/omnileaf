//! The sync contract shared by every device and the sync server: stable ids, content fingerprints, the hybrid logical clock and how registers merge.

mod clock;
mod fingerprint;
mod id;
mod node;
mod norm;
mod register;
mod value;

pub use clock::{ClockError, Hlc};
pub use fingerprint::{
    Fingerprint, FingerprintError, FingerprintKind, FolderImage, FolderManifest, ImageEntry,
    RAW1_SAMPLE_COUNT,
};
pub use id::{BookId, CategoryId, IdError, KeyError, SeriesId};
pub use node::{NodeId, NodeIdLength};
pub use norm::norm;
pub use register::{MergeClass, Register, Stamp};
pub use value::{Value, ValueError};
