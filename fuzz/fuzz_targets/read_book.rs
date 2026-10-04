#![no_main]

use libfuzzer_sys::fuzz_target;
use omnileaf_formats::{FormatError, Limits};
use omnileaf_fuzz::open_bytes;

const MIB: u64 = 1024 * 1024;

const LIMITS: Limits = Limits {
    max_entries: 1_000,
    max_page_bytes: MIB,
    max_total_bytes: 16 * MIB,
    max_compression_ratio: 100,
};

fn within_page_limit(page: &[u8]) -> bool {
    u64::try_from(page.len()).is_ok_and(|size| size <= LIMITS.max_page_bytes)
}

fuzz_target!(|bytes: &[u8]| {
    let Ok(mut book) = open_bytes(bytes, &LIMITS) else {
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
});
