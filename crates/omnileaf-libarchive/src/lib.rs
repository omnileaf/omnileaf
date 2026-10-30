//! libarchive's RAR readers, compiled from the vendored sources.

mod allocator;
mod error;
mod ffi;
mod reader;

pub use allocator::{DEFAULT_LIMIT_BYTES, DESKTOP_LIMIT_BYTES, MOBILE_LIMIT_BYTES};
pub use error::Error;
pub use reader::{Entry, EntryKind, Reader, version};
