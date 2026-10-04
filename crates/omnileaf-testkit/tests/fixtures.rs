#![expect(
    clippy::unwrap_used,
    clippy::indexing_slicing,
    reason = "the fixtures are generated in memory or in a scratch folder, so a failure should stop the test"
)]

use std::{
    collections::BTreeSet,
    env, fs,
    io::{Cursor, Read},
    path::{Path, PathBuf},
    process,
};

use omnileaf_testkit::{
    ArchiveEntry, Compression, GENERATED_LIBRARY_NAME, GeneratedLibrary, PageShape, SAMPLE_LIBRARY,
    SAMPLE_LIBRARY_NAME, cbz, grainy_scan_jpeg, page_jpeg, page_png, page_webp, typical_scan_jpeg,
    write_generated_library, write_sample_library,
};
use zip::{CompressionMethod, DateTime, ZipArchive};

const SEED: u64 = 7;
const CENTRAL_DIRECTORY_SIGNATURE: &[u8] = b"PK\x01\x02";
const UNIX_HOST_SYSTEM: u8 = 3;
const SOF0: [u8; 2] = [0xFF, 0xC0];
const SOF0_COMPONENT_COUNT_OFFSET: usize = 9;
const SOF0_COMPONENT_LENGTH: usize = 3;
const TWICE_EACH_WAY: u8 = 0x22;
const ONCE_EACH_WAY: u8 = 0x11;

struct ScratchFolder(PathBuf);

impl ScratchFolder {
    fn new(name: &str) -> Self {
        let path = env::temp_dir()
            .join(format!("omnileaf-testkit-{}", process::id()))
            .join(name);
        if path.exists() {
            fs::remove_dir_all(&path).unwrap();
        }
        fs::create_dir_all(&path).unwrap();
        Self(path)
    }

    fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for ScratchFolder {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn dimensions(png: &[u8]) -> (u32, u32) {
    let reader = png::Decoder::new(Cursor::new(png)).read_info().unwrap();
    let info = reader.info();
    (info.width, info.height)
}

fn png_pixels(png: &[u8]) -> Vec<u8> {
    let mut reader = png::Decoder::new(Cursor::new(png)).read_info().unwrap();
    let mut pixels = vec![0; reader.output_buffer_size().unwrap()];
    reader.next_frame(&mut pixels).unwrap();
    pixels
}

fn jpeg_dimensions(jpeg: &[u8]) -> (u32, u32) {
    let mut decoder = jpeg_decoder::Decoder::new(jpeg);
    decoder.read_info().unwrap();
    let info = decoder.info().unwrap();
    (u32::from(info.width), u32::from(info.height))
}

fn jpeg_sampling_factors(jpeg: &[u8]) -> Vec<u8> {
    let marker = jpeg.windows(2).position(|pair| pair == SOF0).unwrap();
    let count_at = marker + SOF0_COMPONENT_COUNT_OFFSET;
    jpeg[count_at + 1..]
        .chunks(SOF0_COMPONENT_LENGTH)
        .take(usize::from(jpeg[count_at]))
        .map(|component| component[1])
        .collect()
}

fn sample_entries() -> Vec<ArchiveEntry> {
    (0..3)
        .map(|index| ArchiveEntry {
            name: format!("{:03}.png", index + 1),
            bytes: page_png(SEED, index, PageShape::Portrait).unwrap(),
        })
        .collect()
}

fn read_archive(bytes: Vec<u8>) -> ZipArchive<Cursor<Vec<u8>>> {
    ZipArchive::new(Cursor::new(bytes)).unwrap()
}

#[test]
fn generates_the_same_page_every_time() {
    let first = page_png(SEED, 3, PageShape::Portrait).unwrap();

    let second = page_png(SEED, 3, PageShape::Portrait).unwrap();

    assert_eq!(first, second);
}

#[test]
fn generates_a_different_page_for_each_index() {
    let first = page_png(SEED, 0, PageShape::Portrait).unwrap();

    let second = page_png(SEED, 1, PageShape::Portrait).unwrap();

    assert_ne!(first, second);
}

#[test]
fn makes_a_spread_twice_as_wide_as_a_portrait_page() {
    let (portrait_width, portrait_height) =
        dimensions(&page_png(SEED, 0, PageShape::Portrait).unwrap());

    let (spread_width, spread_height) = dimensions(&page_png(SEED, 0, PageShape::Spread).unwrap());

    assert!(portrait_height > portrait_width);
    assert_eq!(spread_width, portrait_width * 2);
    assert_eq!(spread_height, portrait_height);
}

#[test]
fn draws_a_jpeg_page_at_the_size_of_its_shape() {
    let jpeg = page_jpeg(SEED, 0, PageShape::Spread).unwrap();

    let size = jpeg_dimensions(&jpeg);

    assert_eq!(
        size,
        (PageShape::Spread.width(), PageShape::Spread.height())
    );
}

#[test]
fn draws_a_webp_page_with_exactly_the_pixels_of_the_png_page() {
    let webp = page_webp(SEED, 3, PageShape::Portrait).unwrap();
    let png = page_png(SEED, 3, PageShape::Portrait).unwrap();

    let mut decoder = image_webp::WebPDecoder::new(Cursor::new(webp)).unwrap();
    let mut pixels = vec![0; decoder.output_buffer_size().unwrap()];
    decoder.read_image(&mut pixels).unwrap();

    assert!(!decoder.has_alpha());
    assert_eq!(pixels, png_pixels(&png));
}

#[test]
fn draws_a_grainy_scan_at_the_size_of_a_full_resolution_comic_page() {
    let scan = grainy_scan_jpeg(SEED).unwrap();

    let size = jpeg_dimensions(&scan);

    assert_eq!(size, (1800, 2700));
}

#[test]
fn weighs_a_grainy_scan_a_little_over_a_megabyte() {
    let scan = grainy_scan_jpeg(SEED).unwrap();

    let megabytes = scan.len() / 1_000_000;

    assert_eq!(megabytes, 1, "the scan weighs {} bytes", scan.len());
}

#[test]
fn keeps_a_grainy_scans_chroma_at_full_resolution() {
    let scan = grainy_scan_jpeg(SEED).unwrap();

    let factors = jpeg_sampling_factors(&scan);

    assert_eq!(factors, [ONCE_EACH_WAY; 3]);
}

#[test]
fn draws_a_typical_scan_at_the_size_of_a_full_resolution_comic_page() {
    let scan = typical_scan_jpeg(SEED).unwrap();

    let size = jpeg_dimensions(&scan);

    assert_eq!(size, (1800, 2700));
}

#[test]
fn subsamples_a_typical_scans_chroma_to_4_2_0() {
    let scan = typical_scan_jpeg(SEED).unwrap();

    let factors = jpeg_sampling_factors(&scan);

    assert_eq!(factors, [TWICE_EACH_WAY, ONCE_EACH_WAY, ONCE_EACH_WAY]);
}

#[test]
fn weighs_a_typical_scan_about_a_megabyte() {
    let scan = typical_scan_jpeg(SEED).unwrap();

    let megabytes = scan.len() / 1_000_000;

    assert_eq!(megabytes, 1, "the scan weighs {} bytes", scan.len());
}

#[test]
fn generates_the_same_typical_scan_every_time() {
    let first = typical_scan_jpeg(SEED).unwrap();

    let second = typical_scan_jpeg(SEED).unwrap();

    assert_eq!(first, second);
}

#[test]
fn keeps_archive_entries_in_the_order_given_with_their_bytes() {
    let entries = sample_entries();

    let mut archive = read_archive(cbz(&entries, Compression::Deflated).unwrap());

    assert_eq!(archive.len(), entries.len());
    for (index, entry) in entries.iter().enumerate() {
        let mut file = archive.by_index(index).unwrap();
        let mut bytes = Vec::new();
        file.read_to_end(&mut bytes).unwrap();
        assert_eq!(file.name(), entry.name);
        assert_eq!(bytes, entry.bytes);
    }
}

#[test]
fn stores_or_deflates_every_entry_as_asked() {
    for (compression, method) in [
        (Compression::Stored, CompressionMethod::Stored),
        (Compression::Deflated, CompressionMethod::Deflated),
    ] {
        let mut archive = read_archive(cbz(&sample_entries(), compression).unwrap());

        for index in 0..archive.len() {
            assert_eq!(archive.by_index(index).unwrap().compression(), method);
        }
    }
}

#[test]
fn stamps_every_archive_entry_with_the_same_fixed_time() {
    let mut archive = read_archive(cbz(&sample_entries(), Compression::Stored).unwrap());

    for index in 0..archive.len() {
        assert_eq!(
            archive.by_index(index).unwrap().last_modified(),
            Some(DateTime::default())
        );
    }
}

#[test]
fn writes_every_book_of_the_sample_library_under_neutral_names() {
    let scratch = ScratchFolder::new("library");

    let files = write_sample_library(scratch.path()).unwrap();

    let expected_books: usize = SAMPLE_LIBRARY
        .iter()
        .map(|series| usize::from(series.books))
        .sum();
    assert!(expected_books > 0);
    for series in SAMPLE_LIBRARY {
        assert!(series.name.starts_with("Sample Series "));
        assert!(
            scratch
                .path()
                .join(SAMPLE_LIBRARY_NAME)
                .join(series.name)
                .is_dir()
        );
    }
    for file in &files {
        assert!(file.starts_with(SAMPLE_LIBRARY_NAME));
        assert!(scratch.path().join(file).is_file());
    }
    let mut sorted = files.clone();
    sorted.sort();
    assert_eq!(files, sorted);
}

#[test]
fn writes_identical_files_each_time() {
    let first = ScratchFolder::new("first");
    let second = ScratchFolder::new("second");

    let first_files = write_sample_library(first.path()).unwrap();
    let second_files = write_sample_library(second.path()).unwrap();

    assert_eq!(first_files, second_files);
    for file in &first_files {
        assert_eq!(
            fs::read(first.path().join(file)).unwrap(),
            fs::read(second.path().join(file)).unwrap(),
            "{} differs between two runs",
            file.display()
        );
    }
}

#[test]
fn records_a_unix_host_system_on_every_platform() {
    let bytes = cbz(&sample_entries(), Compression::Stored).unwrap();

    let host_systems: Vec<u8> = bytes
        .windows(CENTRAL_DIRECTORY_SIGNATURE.len() + 2)
        .filter(|header| header.starts_with(CENTRAL_DIRECTORY_SIGNATURE))
        .filter_map(|header| header.last().copied())
        .collect();

    assert_eq!(host_systems, vec![UNIX_HOST_SYSTEM; sample_entries().len()]);
}

#[test]
fn writes_a_generated_library_whose_books_share_every_page_but_their_cover() {
    let scratch = ScratchFolder::new("generated");
    let library = GeneratedLibrary {
        series: 2,
        books_per_series: 3,
        pages_per_book: 4,
    };

    let files = write_generated_library(scratch.path(), library).unwrap();

    let pages: Vec<Vec<Vec<u8>>> = files
        .iter()
        .map(|file| {
            let mut archive = read_archive(fs::read(scratch.path().join(file)).unwrap());
            (0..archive.len())
                .map(|index| {
                    let mut bytes = Vec::new();
                    archive
                        .by_index(index)
                        .unwrap()
                        .read_to_end(&mut bytes)
                        .unwrap();
                    bytes
                })
                .collect()
        })
        .collect();
    assert_eq!(files.len(), 6);
    assert!(
        files
            .iter()
            .all(|file| file.starts_with(GENERATED_LIBRARY_NAME))
    );
    assert!(pages.iter().all(|book| book.len() == 4));
    let covers: BTreeSet<&Vec<u8>> = pages.iter().filter_map(|book| book.first()).collect();
    let rest: BTreeSet<&[Vec<u8>]> = pages.iter().filter_map(|book| book.get(1..)).collect();
    assert_eq!((covers.len(), rest.len()), (6, 1));
}

#[test]
fn counts_a_book_for_every_file_a_generated_library_writes() {
    let scratch = ScratchFolder::new("generated-count");
    let library = GeneratedLibrary {
        series: 3,
        books_per_series: 4,
        pages_per_book: 1,
    };

    let files = write_generated_library(scratch.path(), library).unwrap();

    assert_eq!(usize::try_from(library.books()).unwrap(), files.len());
}
