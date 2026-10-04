//! Deterministic test fixtures: page images, comic archives and a sample library.

mod archive;
mod error;
mod generated_library;
mod library;
mod page;

pub use archive::{ArchiveEntry, Compression, cbz};
pub use error::FixtureError;
pub use generated_library::{GENERATED_LIBRARY_NAME, GeneratedLibrary, write_generated_library};
pub use library::{
    SAMPLE_LIBRARY, SAMPLE_LIBRARY_NAME, SeriesLayout, SeriesSpec, write_sample_library,
};
pub use page::{
    PageShape, full_chroma_scan_jpeg, page_jpeg, page_png, page_webp, subsampled_scan_jpeg,
};
