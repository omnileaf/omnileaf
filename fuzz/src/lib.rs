//! Shared set-up for the fuzz targets.

use std::{env, fs, path::PathBuf, process};

use omnileaf_formats::{Book, FormatError, Limits, open_book_with};

const MIB: u64 = 1024 * 1024;

const READ_LIMITS: Limits = Limits {
    max_entries: 1_000,
    max_page_bytes: MIB,
    max_total_bytes: 16 * MIB,
    max_compression_ratio: 100,
};

/// Opens `bytes` through the same path-based entry point the app uses, via a scratch file private to this process.
#[expect(
    clippy::panic,
    reason = "an unwritable scratch file must stop the fuzzer rather than look like a clean input"
)]
pub fn open_bytes(bytes: &[u8], limits: &Limits) -> Result<Book, FormatError> {
    let scratch = scratch_file();
    if let Err(error) = fs::write(&scratch, bytes) {
        panic!("write the fuzz input to {}: {error}", scratch.display());
    }
    open_book_with(&scratch, limits)
}

pub fn read_every_page(bytes: &[u8]) {
    let Ok(mut book) = open_bytes(bytes, &READ_LIMITS) else {
        return;
    };

    let page_count = book.pages().len();
    for index in 0..page_count {
        if let Ok(page) = book.read_page(index) {
            assert!(within_page_limit(&page), "page {index} read past the limit");
        }
    }
    assert!(
        matches!(
            book.read_page(page_count),
            Err(FormatError::NoSuchPage { .. })
        ),
        "a page past the end was read"
    );
    let _ = book.comic_info();
}

fn within_page_limit(page: &[u8]) -> bool {
    u64::try_from(page.len()).is_ok_and(|size| size <= READ_LIMITS.max_page_bytes)
}

fn scratch_file() -> PathBuf {
    env::temp_dir().join(format!("omnileaf-fuzz-{}.cbz", process::id()))
}
