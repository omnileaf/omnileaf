#![expect(
    clippy::unwrap_used,
    reason = "the books are generated in a scratch folder, so a failed set-up should stop the test"
)]

mod support;

use std::path::Path;

use omnileaf_formats::{FormatError, Limits, open_book, open_book_with};
use omnileaf_testkit::{Compression, PageShape, cbz, page_png};
use support::{ScratchFolder, entry};

const SEED: u64 = 11;

fn page(index: u32) -> Vec<u8> {
    page_png(SEED, index, PageShape::Portrait).unwrap()
}

fn page_names(path: &Path) -> Vec<String> {
    open_book(path)
        .unwrap()
        .pages()
        .iter()
        .map(|page| page.name.clone())
        .collect()
}

#[test]
fn lists_an_archives_pages_in_reading_order() {
    let scratch = ScratchFolder::new("order");
    let archive = cbz(
        &[
            entry("10.png", page(2)),
            entry("2.png", page(1)),
            entry("1.png", page(0)),
        ],
        Compression::Stored,
    )
    .unwrap();

    let path = scratch.write("book.cbz", &archive);

    assert_eq!(page_names(&path), ["1.png", "2.png", "10.png"]);
}

#[test]
fn skips_entries_that_are_not_pages() {
    let scratch = ScratchFolder::new("clutter");
    let archive = cbz(
        &[
            entry("ComicInfo.xml", b"<ComicInfo/>".to_vec()),
            entry("__MACOSX/._1.png", page(9)),
            entry("Thumbs.db", vec![0; 8]),
            entry("1.png", page(0)),
        ],
        Compression::Deflated,
    )
    .unwrap();

    let path = scratch.write("book.cbz", &archive);

    assert_eq!(page_names(&path), ["1.png"]);
}

#[test]
fn reads_every_page_back_exactly_from_stored_and_deflated_archives() {
    let scratch = ScratchFolder::new("read");
    let pages = [page(0), page(1), page(2)];
    for compression in [Compression::Stored, Compression::Deflated] {
        let entries: Vec<_> = pages
            .iter()
            .enumerate()
            .map(|(index, bytes)| entry(&format!("{index:02}.png"), bytes.clone()))
            .collect();
        let path = scratch.write("book.cbz", &cbz(&entries, compression).unwrap());

        let mut book = open_book(&path).unwrap();

        for (index, expected) in pages.iter().enumerate() {
            assert_eq!(&book.read_page(index).unwrap(), expected);
        }
    }
}

#[test]
fn lists_a_folders_images_in_reading_order() {
    let scratch = ScratchFolder::new("folder");
    scratch.write("Chapter/10.png", &page(2));
    scratch.write("Chapter/2.png", &page(1));
    scratch.write("Chapter/.hidden.png", &page(3));
    scratch.write("Chapter/notes.txt", b"not a page");
    let folder = scratch.path().join("Chapter");

    let mut book = open_book(&folder).unwrap();

    assert_eq!(page_names(&folder), ["2.png", "10.png"]);
    assert_eq!(book.read_page(1).unwrap(), page(2));
}

#[test]
fn refuses_a_file_that_is_not_an_archive() {
    let scratch = ScratchFolder::new("unsupported");
    let path = scratch.write("notes.cbz", b"just some text");

    let error = open_book(&path).unwrap_err();

    assert!(
        matches!(error, FormatError::Unsupported { .. }),
        "{error:?}"
    );
}

#[test]
fn reports_a_damaged_archive() {
    let scratch = ScratchFolder::new("corrupt");
    let archive = cbz(&[entry("1.png", page(0))], Compression::Stored).unwrap();
    let truncated = archive.get(..archive.len() / 2).unwrap();
    let path = scratch.write("book.cbz", truncated);

    let error = open_book(&path).unwrap_err();

    assert!(matches!(error, FormatError::Corrupt { .. }), "{error:?}");
}

#[test]
fn reports_a_book_with_no_pages() {
    let scratch = ScratchFolder::new("empty");
    let archive = cbz(
        &[entry("ComicInfo.xml", b"<ComicInfo/>".to_vec())],
        Compression::Stored,
    )
    .unwrap();
    let path = scratch.write("book.cbz", &archive);

    let error = open_book(&path).unwrap_err();

    assert!(matches!(error, FormatError::NoPages { .. }), "{error:?}");
}

#[test]
fn refuses_more_entries_than_the_limit() {
    let scratch = ScratchFolder::new("entries");
    let entries: Vec<_> = (0..3)
        .map(|index| entry(&format!("{index}.png"), page(index)))
        .collect();
    let path = scratch.write("book.cbz", &cbz(&entries, Compression::Stored).unwrap());
    let limits = Limits {
        max_entries: 2,
        ..Limits::default()
    };

    let error = open_book_with(&path, &limits).unwrap_err();

    assert!(
        matches!(error, FormatError::TooManyEntries { count: 3, .. }),
        "{error:?}"
    );
}

#[test]
fn refuses_a_page_larger_than_the_limit() {
    let scratch = ScratchFolder::new("page-size");
    let path = scratch.write(
        "book.cbz",
        &cbz(&[entry("1.png", page(0))], Compression::Stored).unwrap(),
    );
    let limits = Limits {
        max_page_bytes: 64,
        ..Limits::default()
    };

    let error = open_book_with(&path, &limits).unwrap_err();

    assert!(
        matches!(error, FormatError::PageTooLarge { .. }),
        "{error:?}"
    );
}

#[test]
fn refuses_more_bytes_in_total_than_the_limit() {
    let scratch = ScratchFolder::new("total");
    let entries = [entry("1.png", page(0)), entry("2.png", page(1))];
    let path = scratch.write("book.cbz", &cbz(&entries, Compression::Stored).unwrap());
    let one_page = u64::try_from(page(0).len()).unwrap();
    let limits = Limits {
        max_total_bytes: one_page + 1,
        ..Limits::default()
    };

    let error = open_book_with(&path, &limits).unwrap_err();

    assert!(
        matches!(error, FormatError::TooLargeInTotal { .. }),
        "{error:?}"
    );
}

#[test]
fn refuses_a_page_that_expands_suspiciously_far() {
    let scratch = ScratchFolder::new("bomb");
    let zeros = entry("1.png", vec![0; 1024 * 1024]);
    let path = scratch.write("book.cbz", &cbz(&[zeros], Compression::Deflated).unwrap());

    let error = open_book(&path).unwrap_err();

    assert!(
        matches!(error, FormatError::SuspiciousCompression { .. }),
        "{error:?}"
    );
}

#[test]
fn reports_a_page_index_past_the_end() {
    let scratch = ScratchFolder::new("index");
    let path = scratch.write(
        "book.cbz",
        &cbz(&[entry("1.png", page(0))], Compression::Stored).unwrap(),
    );
    let mut book = open_book(&path).unwrap();

    let error = book.read_page(1).unwrap_err();

    assert!(
        matches!(error, FormatError::NoSuchPage { index: 1, .. }),
        "{error:?}"
    );
}
