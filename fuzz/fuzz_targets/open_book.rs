#![no_main]

use libfuzzer_sys::fuzz_target;
use omnileaf_formats::{Limits, natural_cmp};
use omnileaf_fuzz::open_bytes;

fuzz_target!(|bytes: &[u8]| {
    let limits = Limits::default();
    let Ok(book) = open_bytes(bytes, &limits) else {
        return;
    };

    let pages = book.pages();
    assert!(!pages.is_empty(), "a book opened with no pages");
    assert!(
        pages.iter().all(|page| page.size <= limits.max_page_bytes),
        "a page larger than the limit was listed"
    );
    assert!(
        pages.is_sorted_by(|left, right| natural_cmp(&left.name, &right.name).is_le()),
        "the pages are out of reading order"
    );
});
