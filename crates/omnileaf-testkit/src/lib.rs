//! Deterministic test fixtures: page images, comic archives and a sample library.

mod archive;
mod error;
mod library;
mod page;

pub use archive::{ArchiveEntry, Compression, cbz};
pub use error::FixtureError;
pub use library::{
    SAMPLE_LIBRARY, SAMPLE_LIBRARY_NAME, SeriesLayout, SeriesSpec, write_sample_library,
};
pub use page::{PageShape, page_png};
