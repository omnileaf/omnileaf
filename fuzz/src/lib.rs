//! Shared set-up for the fuzz targets.

use std::{env, fs, path::PathBuf, process};

use omnileaf_formats::{Book, FormatError, Limits, open_book_with};

/// Opens `bytes` through the same path-based entry point the app uses, via a scratch file private to this process.
pub fn open_bytes(bytes: &[u8], limits: &Limits) -> Result<Book, FormatError> {
    let scratch = scratch_file();
    if let Err(error) = fs::write(&scratch, bytes) {
        panic!("write the fuzz input to {}: {error}", scratch.display());
    }
    open_book_with(&scratch, limits)
}

fn scratch_file() -> PathBuf {
    env::temp_dir().join(format!("omnileaf-fuzz-{}.cbz", process::id()))
}
