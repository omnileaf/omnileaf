#![expect(
    clippy::unwrap_used,
    reason = "the books are fixtures, so a failed set-up should stop the test"
)]

use std::{fs, path::Path};

use omnileaf_testkit::{ArchiveEntry, PageShape, RarFormat, RarOptions, cbr, page_png};

const PAGES_PER_BOOK: u32 = 2;

pub(crate) fn write_rar_book(path: &Path, seed: u64, format: RarFormat) {
    let entries: Vec<ArchiveEntry> = (0..PAGES_PER_BOOK)
        .map(|index| ArchiveEntry {
            name: format!("{:03}.png", index + 1),
            bytes: page_png(seed, index, PageShape::Portrait).unwrap(),
        })
        .collect();
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, cbr(&entries, &RarOptions::of(format)).unwrap()).unwrap();
}
