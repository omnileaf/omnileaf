#![expect(
    clippy::unwrap_used,
    reason = "the books are generated in a scratch folder, so a failed set-up should stop the test"
)]

mod support;

use std::{
    path::Path,
    sync::{Arc, LazyLock},
};

use omnileaf_formats::{
    Book, Damage, FormatError, Limits, LocalStorage, Storage, fingerprint_book, open_book,
    salvage_book_in,
};
use omnileaf_testkit::{ArchiveEntry, Compression, PageShape, cbz, cut_inside_entry, page_png};
use proptest::prelude::*;
use support::{ScratchFolder, entry};

const SEED: u64 = 23;
const PAGES: usize = 5;
const START_LENGTH: u64 = 16;
const COMIC_INFO: &[u8] = b"<ComicInfo><Manga>YesAndRightToLeft</Manga></ComicInfo>";

static PAGE_ENTRIES: LazyLock<Vec<ArchiveEntry>> = LazyLock::new(|| {
    (0..PAGES)
        .map(|index| {
            let seed_index = u32::try_from(index).unwrap();
            entry(
                &format!("{:02}.png", index + 1),
                page_png(SEED, seed_index, PageShape::Portrait).unwrap(),
            )
        })
        .collect()
});

fn pages() -> Vec<ArchiveEntry> {
    PAGE_ENTRIES.clone()
}

fn salvage(path: &Path) -> Result<Book, FormatError> {
    salvage_book_in(&local_storage(), path, &Limits::default())
}

fn local_storage() -> Arc<dyn Storage> {
    Arc::new(LocalStorage)
}

fn page_names(book: &Book) -> Vec<String> {
    book.pages().iter().map(|page| page.name.clone()).collect()
}

fn names_of(entries: &[ArchiveEntry]) -> Vec<String> {
    entries.iter().map(|entry| entry.name.clone()).collect()
}

#[test]
fn opens_the_pages_before_the_point_an_archive_is_cut_short() {
    let scratch = ScratchFolder::new("salvage-cut");
    let entries = pages();
    let archive = cbz(&entries, Compression::Deflated).unwrap();
    let path = scratch.write("book.cbz", &cut_inside_entry(&archive, 3).unwrap());

    let book = salvage(&path).unwrap();

    assert_eq!(page_names(&book), names_of(&entries[..3]));
    assert_eq!(book.damage(), Some(Damage::EndsEarly));
}

#[test]
fn reads_each_page_that_survives_back_exactly() {
    let scratch = ScratchFolder::new("salvage-read");
    let entries = pages();
    for compression in [Compression::Stored, Compression::Deflated] {
        let archive = cbz(&entries, compression).unwrap();
        let path = scratch.write("book.cbz", &cut_inside_entry(&archive, 2).unwrap());
        let mut book = salvage(&path).unwrap();

        let read: Vec<Vec<u8>> = (0..2).map(|index| book.read_page(index).unwrap()).collect();

        let expected: Vec<Vec<u8>> = entries[..2].iter().map(|page| page.bytes.clone()).collect();
        assert_eq!(read, expected, "{compression:?}");
    }
}

#[test]
fn reads_only_the_start_of_a_page_that_survives() {
    let scratch = ScratchFolder::new("salvage-start");
    let entries = pages();
    let archive = cbz(&entries, Compression::Deflated).unwrap();
    let path = scratch.write("book.cbz", &cut_inside_entry(&archive, 1).unwrap());
    let mut book = salvage(&path).unwrap();

    let start = book.read_page_start(0, START_LENGTH).unwrap();

    let expected = &entries[0].bytes[..usize::try_from(START_LENGTH).unwrap()];
    assert_eq!(start, expected);
}

#[test]
fn refuses_a_page_past_the_last_that_survives() {
    let scratch = ScratchFolder::new("salvage-past");
    let archive = cbz(&pages(), Compression::Stored).unwrap();
    let path = scratch.write("book.cbz", &cut_inside_entry(&archive, 2).unwrap());
    let mut book = salvage(&path).unwrap();

    let error = book.read_page(2).unwrap_err();

    assert!(
        matches!(error, FormatError::NoSuchPage { index: 2, .. }),
        "{error:?}"
    );
}

#[test]
fn opens_every_page_of_an_archive_cut_short_inside_its_directory() {
    let scratch = ScratchFolder::new("salvage-directory");
    let entries = pages();
    let archive = cbz(&entries, Compression::Stored).unwrap();
    let path = scratch.write("book.cbz", &archive[..archive.len() - 8]);

    let book = salvage(&path).unwrap();

    assert_eq!(page_names(&book), names_of(&entries));
    assert_eq!(book.damage(), Some(Damage::EndsEarly));
}

#[test]
fn opens_a_whole_archive_as_it_is_with_no_damage() {
    let scratch = ScratchFolder::new("salvage-whole");
    let entries = pages();
    let path = scratch.write("book.cbz", &cbz(&entries, Compression::Stored).unwrap());

    let book = salvage(&path).unwrap();

    assert_eq!(page_names(&book), names_of(&entries));
    assert_eq!(book.damage(), None);
}

#[test]
fn fingerprints_an_archive_cut_short_inside_its_directory_as_the_whole_archive() {
    let scratch = ScratchFolder::new("salvage-fingerprint");
    let archive = cbz(&pages(), Compression::Deflated).unwrap();
    let whole = scratch.write("whole.cbz", &archive);
    let cut = scratch.write("cut.cbz", &archive[..archive.len() - 8]);
    let mut book = salvage(&cut).unwrap();

    let fingerprint = book.fingerprint().unwrap();

    assert_eq!(fingerprint, fingerprint_book(&whole).unwrap());
}

#[test]
fn still_refuses_an_archive_cut_short_before_any_page_ends() {
    let scratch = ScratchFolder::new("salvage-nothing");
    let archive = cbz(&pages(), Compression::Stored).unwrap();
    let path = scratch.write("book.cbz", &cut_inside_entry(&archive, 0).unwrap());

    let error = salvage(&path).unwrap_err();

    assert!(matches!(error, FormatError::Corrupt { .. }), "{error:?}");
}

#[test]
fn refuses_a_cut_short_archive_when_opened_without_salvaging() {
    let scratch = ScratchFolder::new("salvage-strict");
    let archive = cbz(&pages(), Compression::Stored).unwrap();
    let path = scratch.write("book.cbz", &cut_inside_entry(&archive, 3).unwrap());

    let error = open_book(&path).unwrap_err();

    assert!(matches!(error, FormatError::Corrupt { .. }), "{error:?}");
}

#[test]
fn reads_the_comic_info_that_survives_a_cut() {
    let scratch = ScratchFolder::new("salvage-comic-info");
    let mut entries = vec![entry("ComicInfo.xml", COMIC_INFO.to_vec())];
    entries.extend(pages());
    let archive = cbz(&entries, Compression::Deflated).unwrap();
    let path = scratch.write("book.cbz", &cut_inside_entry(&archive, 4).unwrap());
    let mut book = salvage(&path).unwrap();

    let comic_info = book.comic_info().unwrap();

    assert!(comic_info.is_some_and(|info| info.reading_direction.is_some()));
}

#[test]
fn reads_no_comic_info_from_a_cut_short_archive_holding_none() {
    let scratch = ScratchFolder::new("salvage-no-comic-info");
    let archive = cbz(&pages(), Compression::Deflated).unwrap();
    let path = scratch.write("book.cbz", &cut_inside_entry(&archive, 4).unwrap());
    let mut book = salvage(&path).unwrap();

    let comic_info = book.comic_info().unwrap();

    assert_eq!(comic_info, None);
}

#[test]
fn holds_a_page_that_survives_to_the_page_size_limit() {
    let scratch = ScratchFolder::new("salvage-limit");
    let entries = pages();
    let archive = cbz(&entries, Compression::Stored).unwrap();
    let path = scratch.write("book.cbz", &cut_inside_entry(&archive, 3).unwrap());
    let limits = Limits {
        max_page_bytes: 16,
        ..Limits::default()
    };

    let error = salvage_book_in(&local_storage(), &path, &limits).unwrap_err();

    assert!(
        matches!(error, FormatError::PageTooLarge { .. }),
        "{error:?}"
    );
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(64))]

    #[test]
    fn salvages_only_whole_pages_wherever_the_archive_ends(
        cut_per_mille in 0_usize..1000,
        is_deflated in any::<bool>(),
    ) {
        let scratch = ScratchFolder::new("salvage-anywhere");
        let entries = pages();
        let compression = if is_deflated { Compression::Deflated } else { Compression::Stored };
        let archive = cbz(&entries, compression).unwrap();
        let cut = archive.len() * cut_per_mille / 1000;
        let path = scratch.write("book.cbz", &archive[..cut]);

        let Ok(mut book) = salvage(&path) else {
            return Ok(());
        };

        let count = book.pages().len();
        prop_assert_eq!(page_names(&book), names_of(&entries[..count]));
        for (index, page) in entries[..count].iter().enumerate() {
            prop_assert_eq!(&book.read_page(index).unwrap(), &page.bytes);
        }
    }
}
