#![expect(
    clippy::unwrap_used,
    reason = "the books are generated in a scratch folder, so a failed set-up should stop the test"
)]

mod support;

use std::{fs, path::PathBuf};

use flate2::Crc;
use omnileaf_formats::{FormatError, fingerprint_book};
use omnileaf_sync_proto::{
    Fingerprint, FingerprintError, FingerprintKind, FolderImage, FolderManifest, ImageEntry,
};
use omnileaf_testkit::{ArchiveEntry, Compression, cbz};
use support::{ScratchFolder, entry};

const PAGE_REPEATS: usize = 300;

fn page(index: u32) -> Vec<u8> {
    format!("Sample page {index:03}\n")
        .repeat(PAGE_REPEATS)
        .into_bytes()
}

fn pages() -> Vec<ArchiveEntry> {
    (1..=3)
        .map(|index| entry(&format!("{index:03}.png"), page(index)))
        .collect()
}

fn archive(scratch: &ScratchFolder, entries: &[ArchiveEntry], compression: Compression) -> PathBuf {
    scratch.write("book.cbz", &cbz(entries, compression).unwrap())
}

fn crc32(bytes: &[u8]) -> u32 {
    let mut crc = Crc::new();
    crc.update(bytes);
    crc.sum()
}

#[test]
fn hashes_each_images_crc_and_size_from_the_archive_index() {
    let scratch = ScratchFolder::new("manifest");
    let path = archive(&scratch, &pages(), Compression::Deflated);

    let fingerprint = fingerprint_book(&path).unwrap();

    let expected = Fingerprint::pmf1((1..=3).map(|index| ImageEntry {
        crc32: crc32(&page(index)),
        size: page(index).len() as u64,
    }));
    assert_eq!(fingerprint, expected.unwrap());
}

#[test]
fn leaves_out_clutter_and_metadata() {
    let scratch = ScratchFolder::new("clutter");
    let mut cluttered = pages();
    cluttered.extend([
        entry("ComicInfo.xml", b"<ComicInfo/>".to_vec()),
        entry("__MACOSX/._001.png", page(7)),
        entry(".cover.png", page(8)),
        entry("notes.txt", page(9)),
        entry("extras/", Vec::new()),
    ]);
    let plain = fingerprint_book(&archive(&scratch, &pages(), Compression::Stored)).unwrap();

    let fingerprint = fingerprint_book(&archive(&scratch, &cluttered, Compression::Stored));

    assert_eq!(fingerprint.unwrap(), plain);
}

#[test]
fn counts_entries_named_from_the_archive_root_with_a_leading_dot_slash() {
    let scratch = ScratchFolder::new("dot-slash");
    let prefixed: Vec<ArchiveEntry> = pages()
        .into_iter()
        .map(|page| entry(&format!("./{}", page.name), page.bytes))
        .collect();
    let plain = fingerprint_book(&archive(&scratch, &pages(), Compression::Stored)).unwrap();

    let fingerprint = fingerprint_book(&archive(&scratch, &prefixed, Compression::Stored));

    assert_eq!(fingerprint.unwrap(), plain);
}

#[test]
fn counts_every_image_extension_even_ones_the_reader_cannot_show() {
    let scratch = ScratchFolder::new("extensions");
    let only_tiff = [entry("001.TIFF", page(1))];

    let fingerprint = fingerprint_book(&archive(&scratch, &only_tiff, Compression::Stored));

    assert_eq!(fingerprint.unwrap().kind(), FingerprintKind::Pmf1);
}

#[test]
fn an_image_folder_hashes_its_image_names_sizes_and_outer_edges() {
    let scratch = ScratchFolder::new("folder");
    for page in pages() {
        scratch.write(&format!("Chapter 01/{}", page.name), &page.bytes);
    }
    scratch.write("Chapter 01/ComicInfo.xml", b"<ComicInfo/>");
    scratch.write("Chapter 01/.cover.png", &page(8));
    let manifest = FolderManifest::new(pages().into_iter().map(|page| FolderImage {
        size: page.bytes.len() as u64,
        name: page.name,
    }))
    .unwrap();

    let fingerprint = fingerprint_book(&scratch.path().join("Chapter 01")).unwrap();

    assert_eq!(fingerprint.kind(), FingerprintKind::Dir1);
    assert_eq!(
        fingerprint,
        Fingerprint::dir1(&manifest, &page(1), &page(3)).unwrap()
    );
}

#[cfg(unix)]
#[test]
fn an_image_folder_leaves_out_images_linked_into_it() {
    let scratch = ScratchFolder::new("folder-link");
    for page in pages() {
        scratch.write(&format!("Chapter 01/{}", page.name), &page.bytes);
    }
    let elsewhere = scratch.write("Elsewhere/004.png", &page(4));
    std::os::unix::fs::symlink(elsewhere, scratch.path().join("Chapter 01/004.png")).unwrap();
    let manifest = FolderManifest::new(pages().into_iter().map(|page| FolderImage {
        size: page.bytes.len() as u64,
        name: page.name,
    }))
    .unwrap();

    let fingerprint = fingerprint_book(&scratch.path().join("Chapter 01")).unwrap();

    assert_eq!(
        fingerprint,
        Fingerprint::dir1(&manifest, &page(1), &page(3)).unwrap()
    );
}

#[cfg(unix)]
#[test]
fn an_image_folder_whose_entries_cannot_be_read_has_no_fingerprint() {
    use std::os::unix::fs::PermissionsExt;
    let scratch = ScratchFolder::new("folder-locked");
    for page in pages() {
        scratch.write(&format!("Chapter 01/{}", page.name), &page.bytes);
    }
    let folder = scratch.path().join("Chapter 01");
    fs::set_permissions(&folder, fs::Permissions::from_mode(0o444)).unwrap();

    let result = fingerprint_book(&folder);

    fs::set_permissions(&folder, fs::Permissions::from_mode(0o755)).unwrap();
    assert!(
        matches!(result, Err(FormatError::Read { .. })),
        "{result:?}"
    );
}

#[test]
fn samples_the_raw_bytes_of_an_archive_without_images() {
    let scratch = ScratchFolder::new("raw");
    let entries = [entry("notes.txt", page(1).repeat(40))];
    let path = archive(&scratch, &entries, Compression::Stored);
    let bytes = fs::read(&path).unwrap();
    let samples = Fingerprint::raw1_ranges(bytes.len() as u64).map(|range| {
        let start = usize::try_from(range.start).unwrap();
        let end = usize::try_from(range.end).unwrap();
        bytes.get(start..end).unwrap()
    });

    let fingerprint = fingerprint_book(&path).unwrap();

    assert_eq!(fingerprint.kind(), FingerprintKind::Raw1);
    assert_eq!(
        fingerprint,
        Fingerprint::raw1(bytes.len() as u64, &samples).unwrap()
    );
}

#[test]
fn a_folder_without_images_has_no_fingerprint() {
    let scratch = ScratchFolder::new("empty-folder");
    scratch.write("Chapter 01/notes.txt", b"not a page");

    let error = fingerprint_book(&scratch.path().join("Chapter 01")).unwrap_err();

    assert!(
        matches!(
            error,
            FormatError::Fingerprint {
                source: FingerprintError::NoImages,
                ..
            }
        ),
        "{error:?}"
    );
}

#[test]
fn refuses_a_file_that_is_not_an_archive() {
    let scratch = ScratchFolder::new("unsupported");
    let path = scratch.write("notes.cbz", b"just some text");

    let error = fingerprint_book(&path).unwrap_err();

    assert!(
        matches!(error, FormatError::Unsupported { .. }),
        "{error:?}"
    );
}
