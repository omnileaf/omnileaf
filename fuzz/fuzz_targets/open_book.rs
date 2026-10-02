#![no_main]

use libfuzzer_sys::fuzz_target;
use omnileaf_formats::{Limits, Page, natural_cmp};
use omnileaf_fuzz::open_bytes;

fn in_reading_order(pages: &[Page]) -> bool {
    pages.windows(2).all(|pair| match pair {
        [left, right] => natural_cmp(&left.name, &right.name).is_le(),
        _ => true,
    })
}

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
        in_reading_order(pages),
        "the pages are out of reading order"
    );
});
