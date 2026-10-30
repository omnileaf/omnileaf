#![expect(
    clippy::unwrap_used,
    reason = "the books are generated in a scratch folder, so a failed set-up should stop the test"
)]

mod support;

use std::{ops::ControlFlow, path::Path};

use omnileaf_formats::{
    FormatError, Limits, fingerprint_book, open_book, open_book_with, parse_comic_info,
};
use omnileaf_testkit::{
    ArchiveEntry, Compression, Packing, PageShape, RarFormat, RarOptions, cbr, cbz, page_png,
};
use support::{ScratchFolder, entry};

const SEED: u64 = 17;
const START_LENGTH: u64 = 64;
const FORMATS: [RarFormat; 2] = [RarFormat::RAR4, RarFormat::RAR5];
const COMIC_INFO: &str = "<ComicInfo><Series>Sample Series 01</Series></ComicInfo>";

fn page(index: u32) -> Vec<u8> {
    page_png(SEED, index, PageShape::Portrait).unwrap()
}

fn stored(entries: &[ArchiveEntry], format: RarFormat) -> Vec<u8> {
    cbr(entries, &RarOptions::of(format)).unwrap()
}

fn three_pages() -> Vec<ArchiveEntry> {
    vec![
        entry("10.png", page(2)),
        entry("2.png", page(1)),
        entry("1.png", page(0)),
    ]
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

#[test]
fn opens_a_cbr_and_lists_its_pages_in_natural_order() {
    let scratch = ScratchFolder::new("cbr-order");
    for format in FORMATS {
        let path = scratch.write("book.cbr", &stored(&three_pages(), format));

        let names = page_names(&path);

        assert_eq!(names, ["1.png", "2.png", "10.png"], "{format:?}");
    }
}

#[test]
fn reads_every_page_of_a_cbr_back_exactly_in_any_order() {
    let scratch = ScratchFolder::new("cbr-read");
    for format in FORMATS {
        let path = scratch.write("book.cbr", &stored(&three_pages(), format));
        let mut book = open_book(&path).unwrap();

        let pages: Vec<_> = [2, 0, 1]
            .into_iter()
            .map(|index| book.read_page(index).unwrap())
            .collect();

        assert_eq!(pages, [page(2), page(0), page(1)], "{format:?}");
    }
}

#[test]
fn reads_every_page_of_a_cbr_with_its_place_in_reading_order() {
    let scratch = ScratchFolder::new("cbr-every-page");
    let entries = [
        entry("chapter/", Vec::new()),
        entry("chapter/2.png", page(1)),
        entry("ComicInfo.xml", COMIC_INFO.as_bytes().to_vec()),
        entry("chapter/1.png", page(0)),
        entry("chapter/3.png", Vec::new()),
    ];
    for format in FORMATS {
        let path = scratch.write("book.cbr", &stored(&entries, format));

        let read = every_page_read(&path);

        assert_eq!(
            read,
            [(0, page(0)), (1, page(1)), (2, Vec::new())],
            "{format:?}"
        );
    }
}

#[test]
fn stops_reading_the_pages_of_a_cbr_once_told_to() {
    let scratch = ScratchFolder::new("cbr-every-page-stop");
    for format in FORMATS {
        let path = scratch.write("book.cbr", &stored(&three_pages(), format));
        let mut book = open_book(&path).unwrap();
        let mut read = 0;

        book.read_every_page(|_, _| {
            read += 1;
            ControlFlow::Break(())
        })
        .unwrap();

        assert_eq!(read, 1, "{format:?}");
    }
}

#[test]
fn reads_the_start_of_a_cbr_page_and_all_of_a_page_shorter_than_asked_for() {
    let scratch = ScratchFolder::new("cbr-read-start");
    for format in FORMATS {
        let path = scratch.write("book.cbr", &stored(&three_pages(), format));
        let mut book = open_book(&path).unwrap();

        let start = book.read_page_start(1, START_LENGTH).unwrap();
        let whole = book.read_page_start(1, u64::MAX).unwrap();

        assert_eq!(
            start,
            page(1)[..usize::try_from(START_LENGTH).unwrap()],
            "{format:?}"
        );
        assert_eq!(whole, page(1), "{format:?}");
    }
}

#[test]
fn reads_the_comic_info_of_a_cbr() {
    let scratch = ScratchFolder::new("cbr-comic-info");
    let entries = [
        entry("1.png", page(0)),
        entry("comicinfo.xml", COMIC_INFO.as_bytes().to_vec()),
    ];
    for format in FORMATS {
        let path = scratch.write("book.cbr", &stored(&entries, format));
        let mut book = open_book(&path).unwrap();

        let comic_info = book.comic_info().unwrap();

        assert_eq!(
            comic_info,
            Some(parse_comic_info(COMIC_INFO.as_bytes()).unwrap()),
            "{format:?}"
        );
    }
}

#[test]
fn reports_no_comic_info_for_a_cbr_without_one() {
    let scratch = ScratchFolder::new("cbr-no-comic-info");
    for format in FORMATS {
        let path = scratch.write("book.cbr", &stored(&three_pages(), format));
        let mut book = open_book(&path).unwrap();

        let comic_info = book.comic_info().unwrap();

        assert_eq!(comic_info, None, "{format:?}");
    }
}

#[test]
fn recognises_a_cbr_by_its_content_whatever_its_name() {
    let scratch = ScratchFolder::new("cbr-detect");
    for format in FORMATS {
        let archive = stored(&three_pages(), format);
        for name in ["book.cbr", "book.rar", "book.cbz", "book"] {
            let path = scratch.write(name, &archive);

            let names = page_names(&path);

            assert_eq!(names, ["1.png", "2.png", "10.png"], "{format:?} {name}");
        }
    }
}

#[test]
fn fingerprints_a_cbr_like_a_cbz_of_the_same_images_opened_or_not() {
    let scratch = ScratchFolder::new("cbr-fingerprint");
    let cbz_path = scratch.write(
        "book.cbz",
        &cbz(&three_pages(), Compression::Stored).unwrap(),
    );
    let expected = fingerprint_book(&cbz_path).unwrap();
    for format in FORMATS {
        let path = scratch.write("book.cbr", &stored(&three_pages(), format));

        let opened = open_book(&path).unwrap().fingerprint().unwrap();
        let unopened = fingerprint_book(&path).unwrap();

        assert_eq!(opened, expected, "{format:?}");
        assert_eq!(unopened, expected, "{format:?}");
    }
}

#[test]
fn reports_no_damage_for_a_whole_cbr() {
    let scratch = ScratchFolder::new("cbr-damage");
    for format in FORMATS {
        let path = scratch.write("book.cbr", &stored(&three_pages(), format));

        let damage = open_book(&path).unwrap().damage();

        assert_eq!(damage, None, "{format:?}");
    }
}

#[test]
fn refuses_to_read_a_stored_solid_rar5_page_libarchive_cannot_decode() {
    let scratch = ScratchFolder::new("cbr-solid");
    let options = RarOptions {
        packing: Packing::Solid,
        ..RarOptions::of(RarFormat::RAR5)
    };
    let path = scratch.write("book.cbr", &cbr(&three_pages(), &options).unwrap());
    let mut book = open_book(&path).unwrap();

    let error = book.read_page(0).unwrap_err();

    assert!(
        matches!(&error, FormatError::CorruptRar { message, .. } if message.contains("solid")),
        "{error:?}"
    );
}

#[test]
fn reports_a_cbr_with_no_pages() {
    let scratch = ScratchFolder::new("cbr-empty");
    let entries = [entry("ComicInfo.xml", COMIC_INFO.as_bytes().to_vec())];
    for format in FORMATS {
        let path = scratch.write("book.cbr", &stored(&entries, format));

        let error = open_book(&path).unwrap_err();

        assert!(
            matches!(error, FormatError::NoPages { .. }),
            "{format:?}: {error:?}"
        );
    }
}

#[test]
fn reports_a_cbr_page_index_past_the_end() {
    let scratch = ScratchFolder::new("cbr-index");
    for format in FORMATS {
        let path = scratch.write("book.cbr", &stored(&three_pages(), format));
        let mut book = open_book(&path).unwrap();

        let error = book.read_page(3).unwrap_err();

        assert!(
            matches!(error, FormatError::NoSuchPage { index: 3, .. }),
            "{format:?}: {error:?}"
        );
    }
}

#[test]
fn refuses_a_cbr_the_header_check_refuses() {
    let scratch = ScratchFolder::new("cbr-gate");
    let limits = Limits {
        max_entries: 2,
        ..Limits::default()
    };
    for format in FORMATS {
        let path = scratch.write("book.cbr", &stored(&three_pages(), format));

        let error = open_book_with(&path, &limits).unwrap_err();

        assert!(
            matches!(error, FormatError::TooManyEntries { .. }),
            "{format:?}: {error:?}"
        );
    }
}

#[test]
fn reports_an_unknown_rar_version_as_a_rar_it_cannot_open_yet() {
    let scratch = ScratchFolder::new("cbr-unknown-version");
    let path = scratch.write("book.cbr", b"Rar!\x1a\x07\x02\x00");

    let error = open_book(&path).unwrap_err();

    assert!(
        matches!(error, FormatError::ArchiveNotSupportedYet { .. }),
        "{error:?}"
    );
}
