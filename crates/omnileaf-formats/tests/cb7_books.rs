#![expect(
    clippy::unwrap_used,
    reason = "the books are generated in a scratch folder, so a failed set-up should stop the test"
)]

mod support;

use std::{ops::ControlFlow, path::Path};

use omnileaf_formats::{
    FormatError, Limits, fingerprint_book, open_book, open_book_with, parse_comic_info,
};
use omnileaf_testkit::{ArchiveEntry, Compression, Packing, PageShape, cb7, cbz, page_png};
use support::{ScratchFolder, entry};

const SEED: u64 = 13;
const START_LENGTH: u64 = 64;
const PACKINGS: [Packing; 2] = [Packing::Solid, Packing::PerEntry];
const COMIC_INFO: &str = "<ComicInfo><Series>Sample Series 01</Series></ComicInfo>";

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

fn every_page_read(path: &Path) -> Vec<(usize, Vec<u8>)> {
    let mut read = Vec::new();
    open_book(path)
        .unwrap()
        .read_every_page(|index, page| {
            read.push((index, page));
            ControlFlow::Continue(())
        })
        .unwrap();
    read.sort();
    read
}

fn three_pages() -> Vec<ArchiveEntry> {
    vec![
        entry("10.png", page(2)),
        entry("2.png", page(1)),
        entry("1.png", page(0)),
    ]
}

#[test]
fn opens_a_cb7_and_lists_its_pages_in_natural_order() {
    let scratch = ScratchFolder::new("cb7-order");
    for packing in PACKINGS {
        let path = scratch.write("book.cb7", &cb7(&three_pages(), packing).unwrap());

        let names = page_names(&path);

        assert_eq!(names, ["1.png", "2.png", "10.png"], "{packing:?}");
    }
}

#[test]
fn reads_every_page_of_a_cb7_back_exactly_in_any_order() {
    let scratch = ScratchFolder::new("cb7-read");
    for packing in PACKINGS {
        let path = scratch.write("book.cb7", &cb7(&three_pages(), packing).unwrap());
        let mut book = open_book(&path).unwrap();

        let pages: Vec<_> = [2, 0, 1]
            .into_iter()
            .map(|index| book.read_page(index).unwrap())
            .collect();

        assert_eq!(pages, [page(2), page(0), page(1)], "{packing:?}");
    }
}

#[test]
fn reads_every_page_of_a_cb7_with_its_place_in_reading_order() {
    let scratch = ScratchFolder::new("cb7-every-page");
    for packing in PACKINGS {
        let path = scratch.write("book.cb7", &cb7(&three_pages(), packing).unwrap());

        let read = every_page_read(&path);

        assert_eq!(
            read,
            [(0, page(0)), (1, page(1)), (2, page(2))],
            "{packing:?}"
        );
    }
}

#[test]
fn reads_an_empty_cb7_page_as_no_bytes_among_the_others() {
    let scratch = ScratchFolder::new("cb7-every-page-empty");
    let entries = [entry("2.png", Vec::new()), entry("1.png", page(0))];
    for packing in PACKINGS {
        let path = scratch.write("book.cb7", &cb7(&entries, packing).unwrap());

        let read = every_page_read(&path);

        assert_eq!(read, [(0, page(0)), (1, Vec::new())], "{packing:?}");
    }
}

#[test]
fn stops_reading_the_pages_of_a_cb7_once_told_to() {
    let scratch = ScratchFolder::new("cb7-every-page-stop");
    for packing in PACKINGS {
        let path = scratch.write("book.cb7", &cb7(&three_pages(), packing).unwrap());
        let mut book = open_book(&path).unwrap();
        let mut read = 0;

        book.read_every_page(|_, _| {
            read += 1;
            ControlFlow::Break(())
        })
        .unwrap();

        assert_eq!(read, 1, "{packing:?}");
    }
}

#[test]
fn reads_the_start_of_a_cb7_page_and_all_of_a_page_shorter_than_asked_for() {
    let scratch = ScratchFolder::new("cb7-read-start");
    for packing in PACKINGS {
        let path = scratch.write("book.cb7", &cb7(&three_pages(), packing).unwrap());
        let mut book = open_book(&path).unwrap();

        let start = book.read_page_start(1, START_LENGTH).unwrap();
        let whole = book.read_page_start(1, u64::MAX).unwrap();

        assert_eq!(
            start,
            page(1)[..usize::try_from(START_LENGTH).unwrap()],
            "{packing:?}"
        );
        assert_eq!(whole, page(1), "{packing:?}");
    }
}

#[test]
fn skips_cb7_entries_that_are_not_pages() {
    let scratch = ScratchFolder::new("cb7-clutter");
    let entries = [
        entry("chapter/", Vec::new()),
        entry("ComicInfo.xml", COMIC_INFO.as_bytes().to_vec()),
        entry("__MACOSX/._1.png", page(9)),
        entry(".hidden.png", page(8)),
        entry("Thumbs.db", vec![0; 8]),
        entry("chapter/1.png", page(0)),
    ];
    let path = scratch.write("book.cb7", &cb7(&entries, Packing::Solid).unwrap());

    let names = page_names(&path);

    assert_eq!(names, ["chapter/1.png"]);
}

#[test]
fn skips_cb7_entries_that_escape_the_archive() {
    let scratch = ScratchFolder::new("cb7-escape");
    let entries = [
        entry("../1.png", page(0)),
        entry("chapter/../../2.png", page(1)),
        entry("/3.png", page(2)),
        entry("4.png", page(3)),
    ];
    let path = scratch.write("book.cb7", &cb7(&entries, Packing::Solid).unwrap());

    let names = page_names(&path);

    assert_eq!(names, ["4.png"]);
}

#[test]
fn reads_the_comic_info_of_a_cb7() {
    let scratch = ScratchFolder::new("cb7-comic-info");
    let entries = [
        entry("1.png", page(0)),
        entry("ComicInfo.xml", COMIC_INFO.as_bytes().to_vec()),
    ];
    for packing in PACKINGS {
        let path = scratch.write("book.cb7", &cb7(&entries, packing).unwrap());
        let mut book = open_book(&path).unwrap();

        let comic_info = book.comic_info().unwrap();

        assert_eq!(
            comic_info,
            Some(parse_comic_info(COMIC_INFO.as_bytes()).unwrap()),
            "{packing:?}"
        );
    }
}

#[test]
fn reports_no_comic_info_for_a_cb7_without_one() {
    let scratch = ScratchFolder::new("cb7-no-comic-info");
    let path = scratch.write("book.cb7", &cb7(&three_pages(), Packing::Solid).unwrap());
    let mut book = open_book(&path).unwrap();

    let comic_info = book.comic_info().unwrap();

    assert_eq!(comic_info, None);
}

#[test]
fn recognises_a_cb7_by_its_content_whatever_its_name() {
    let scratch = ScratchFolder::new("cb7-detect");
    let archive = cb7(&three_pages(), Packing::Solid).unwrap();
    for name in ["book.cb7", "book.7z", "book.cbz", "book"] {
        let path = scratch.write(name, &archive);

        let names = page_names(&path);

        assert_eq!(names, ["1.png", "2.png", "10.png"], "{name}");
    }
}

#[test]
fn reports_a_damaged_cb7() {
    let scratch = ScratchFolder::new("cb7-corrupt");
    let archive = cb7(&three_pages(), Packing::Solid).unwrap();
    let path = scratch.write("book.cb7", archive.get(..archive.len() / 2).unwrap());

    let error = open_book(&path).unwrap_err();

    assert!(
        matches!(error, FormatError::CorruptSevenZip { .. }),
        "{error:?}"
    );
}

#[test]
fn reports_a_cb7_with_no_pages() {
    let scratch = ScratchFolder::new("cb7-empty");
    let entries = [entry("ComicInfo.xml", COMIC_INFO.as_bytes().to_vec())];
    let path = scratch.write("book.cb7", &cb7(&entries, Packing::Solid).unwrap());

    let error = open_book(&path).unwrap_err();

    assert!(matches!(error, FormatError::NoPages { .. }), "{error:?}");
}

#[test]
fn refuses_a_cb7_with_more_entries_than_the_limit() {
    let scratch = ScratchFolder::new("cb7-entries");
    let path = scratch.write("book.cb7", &cb7(&three_pages(), Packing::Solid).unwrap());
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
fn refuses_a_cb7_page_larger_than_the_limit() {
    let scratch = ScratchFolder::new("cb7-page-size");
    let path = scratch.write("book.cb7", &cb7(&three_pages(), Packing::Solid).unwrap());
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
fn refuses_a_cb7_holding_more_bytes_in_total_than_the_limit_pages_or_not() {
    let scratch = ScratchFolder::new("cb7-total");
    let entries = [entry("1.png", page(0)), entry("notes.txt", page(1))];
    let path = scratch.write("book.cb7", &cb7(&entries, Packing::Solid).unwrap());
    let limits = Limits {
        max_total_bytes: u64::try_from(page(0).len()).unwrap() + 1,
        ..Limits::default()
    };

    let error = open_book_with(&path, &limits).unwrap_err();

    assert!(
        matches!(error, FormatError::TooLargeInTotal { .. }),
        "{error:?}"
    );
}

#[test]
fn refuses_a_cb7_page_that_expands_suspiciously_far() {
    let scratch = ScratchFolder::new("cb7-bomb");
    let zeros = [entry("1.png", vec![0; 1024 * 1024])];
    let path = scratch.write("book.cb7", &cb7(&zeros, Packing::Solid).unwrap());

    let error = open_book(&path).unwrap_err();

    assert!(
        matches!(error, FormatError::SuspiciousCompression { .. }),
        "{error:?}"
    );
}

#[test]
fn refuses_a_cb7_whose_block_without_pages_expands_suspiciously_far() {
    let scratch = ScratchFolder::new("cb7-bomb-elsewhere");
    let entries = [
        entry("1.png", page(0)),
        entry("ComicInfo.xml", vec![0; 1024 * 1024]),
    ];
    let path = scratch.write("book.cb7", &cb7(&entries, Packing::PerEntry).unwrap());

    let error = open_book(&path).unwrap_err();

    assert!(
        matches!(&error, FormatError::SuspiciousCompression { name, .. } if name == "ComicInfo.xml"),
        "{error:?}"
    );
}

#[test]
fn reports_a_cb7_page_index_past_the_end() {
    let scratch = ScratchFolder::new("cb7-index");
    let path = scratch.write("book.cb7", &cb7(&three_pages(), Packing::Solid).unwrap());
    let mut book = open_book(&path).unwrap();

    let error = book.read_page(3).unwrap_err();

    assert!(
        matches!(error, FormatError::NoSuchPage { index: 3, .. }),
        "{error:?}"
    );
}

#[test]
fn fingerprints_a_cb7_like_a_cbz_of_the_same_images() {
    let scratch = ScratchFolder::new("cb7-fingerprint");
    let cbz_path = scratch.write(
        "book.cbz",
        &cbz(&three_pages(), Compression::Deflated).unwrap(),
    );
    let cb7_path = scratch.write("book.cb7", &cb7(&three_pages(), Packing::Solid).unwrap());

    let opened = open_book(&cb7_path).unwrap().fingerprint().unwrap();
    let unopened = fingerprint_book(&cb7_path).unwrap();

    let expected = fingerprint_book(&cbz_path).unwrap();
    assert_eq!(opened, expected);
    assert_eq!(unopened, expected);
}

#[test]
fn fingerprints_a_cb7_with_an_empty_image_like_a_cbz() {
    let scratch = ScratchFolder::new("cb7-fingerprint-empty");
    let entries = [entry("1.png", page(0)), entry("2.png", Vec::new())];
    let cbz_path = scratch.write("book.cbz", &cbz(&entries, Compression::Stored).unwrap());
    let cb7_path = scratch.write("book.cb7", &cb7(&entries, Packing::Solid).unwrap());

    let fingerprint = fingerprint_book(&cb7_path).unwrap();

    assert_eq!(fingerprint, fingerprint_book(&cbz_path).unwrap());
}
