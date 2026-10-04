#![expect(
    clippy::unwrap_used,
    reason = "the books are fixtures, so a failed set-up should stop the test"
)]

use std::{fs, path::Path};

use omnileaf_testkit::{ArchiveEntry, Compression, PageShape, cbz, page_png};

const PAGES_PER_BOOK: u32 = 2;

/// Writes a comic whose pages, and so whose fingerprint, follow from `seed`.
pub(crate) fn write_book(path: &Path, seed: u64) {
    write_book_with(path, seed, None);
}

pub(crate) fn write_book_with(path: &Path, seed: u64, comic_info: Option<&str>) {
    let mut entries: Vec<ArchiveEntry> = (0..PAGES_PER_BOOK)
        .map(|index| ArchiveEntry {
            name: format!("{:03}.png", index + 1),
            bytes: page_png(seed, index, PageShape::Portrait).unwrap(),
        })
        .collect();
    if let Some(xml) = comic_info {
        entries.push(ArchiveEntry {
            name: "ComicInfo.xml".to_owned(),
            bytes: xml.as_bytes().to_vec(),
        });
    }
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, cbz(&entries, Compression::Stored).unwrap()).unwrap();
}

/// Writes a one-page book of images into `folder`.
pub(crate) fn write_page(folder: &Path, seed: u64) {
    fs::create_dir_all(folder).unwrap();
    fs::write(
        folder.join("001.png"),
        page_png(seed, 0, PageShape::Portrait).unwrap(),
    )
    .unwrap();
}
