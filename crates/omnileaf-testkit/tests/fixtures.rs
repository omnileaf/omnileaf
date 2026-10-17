#![expect(
    clippy::unwrap_used,
    clippy::indexing_slicing,
    reason = "the fixtures are generated in memory or in a scratch folder, so a failure should stop the test"
)]

use std::{
    collections::BTreeSet,
    fs,
    io::{Cursor, Read},
};

use omnileaf_testkit::{
    ArchiveEntry, Compression, GENERATED_LIBRARY_NAME, GeneratedLibrary, Packing, PageShape,
    SAMPLE_LIBRARY, SAMPLE_LIBRARY_NAME, ScratchFolder, cb7, cbz, full_chroma_scan_jpeg,
    incompressible_bytes, page_jpeg, page_png, page_webp, subsampled_scan_jpeg,
    write_generated_library, write_sample_library,
};
use sevenz_rust2::{ArchiveReader, Password};
use zip::{CompressionMethod, DateTime, ZipArchive};

const SEED: u64 = 7;
const CENTRAL_DIRECTORY_SIGNATURE: &[u8] = b"PK\x01\x02";
const UNIX_HOST_SYSTEM: u8 = 3;
const SOF0: [u8; 2] = [0xFF, 0xC0];
const SOF0_COMPONENT_COUNT_OFFSET: usize = 9;
const SOF0_COMPONENT_LENGTH: usize = 3;
const TWICE_EACH_WAY: u8 = 0x22;
const ONCE_EACH_WAY: u8 = 0x11;

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

fn read_cb7(bytes: Vec<u8>, password: &str) -> Result<Vec<(String, Vec<u8>)>, sevenz_rust2::Error> {
    let mut archive = ArchiveReader::new(Cursor::new(bytes), Password::from(password))?;
    let mut entries = Vec::new();
    archive.for_each_entries(|entry, reader| {
        let mut bytes = Vec::new();
        reader.read_to_end(&mut bytes)?;
        entries.push((entry.name().to_owned(), bytes));
        Ok(true)
    })?;
    Ok(entries)
}

fn named_bytes(entries: &[ArchiveEntry]) -> Vec<(String, Vec<u8>)> {
    entries
        .iter()
        .map(|entry| (entry.name.clone(), entry.bytes.clone()))
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
fn draws_a_full_chroma_scan_at_the_size_of_a_full_resolution_comic_page() {
    let scan = full_chroma_scan_jpeg(SEED).unwrap();

    let size = jpeg_dimensions(&scan);

    assert_eq!(size, (1800, 2700));
}

#[test]
fn weighs_a_full_chroma_scan_a_little_over_a_megabyte() {
    let scan = full_chroma_scan_jpeg(SEED).unwrap();

    let megabytes = scan.len() / 1_000_000;

    assert_eq!(megabytes, 1, "the scan weighs {} bytes", scan.len());
}

#[test]
fn keeps_a_full_chroma_scans_chroma_at_full_resolution() {
    let scan = full_chroma_scan_jpeg(SEED).unwrap();

    let factors = jpeg_sampling_factors(&scan);

    assert_eq!(factors, [ONCE_EACH_WAY; 3]);
}

#[test]
fn draws_a_subsampled_scan_at_the_size_of_a_full_resolution_comic_page() {
    let scan = subsampled_scan_jpeg(SEED).unwrap();

    let size = jpeg_dimensions(&scan);

    assert_eq!(size, (1800, 2700));
}

#[test]
fn subsamples_a_subsampled_scans_chroma_to_4_2_0() {
    let scan = subsampled_scan_jpeg(SEED).unwrap();

    let factors = jpeg_sampling_factors(&scan);

    assert_eq!(factors, [TWICE_EACH_WAY, ONCE_EACH_WAY, ONCE_EACH_WAY]);
}

#[test]
fn weighs_a_subsampled_scan_about_a_megabyte() {
    let scan = subsampled_scan_jpeg(SEED).unwrap();

    let megabytes = scan.len() / 1_000_000;

    assert_eq!(megabytes, 1, "the scan weighs {} bytes", scan.len());
}

#[test]
fn generates_the_same_subsampled_scan_every_time() {
    let first = subsampled_scan_jpeg(SEED).unwrap();

    let second = subsampled_scan_jpeg(SEED).unwrap();

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
        assert_eq!(file.name().unwrap(), entry.name);
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
fn keeps_cb7_entries_in_the_order_given_with_their_bytes() {
    let entries = sample_entries();
    for packing in [Packing::Solid, Packing::PerEntry] {
        let archive = cb7(&entries, packing).unwrap();

        let read = read_cb7(archive, "").unwrap();

        assert_eq!(read, named_bytes(&entries), "{packing:?}");
    }
}

#[test]
fn packs_a_solid_cb7_in_one_block_and_otherwise_one_block_per_entry() {
    for (packing, blocks) in [(Packing::Solid, 1), (Packing::PerEntry, 3)] {
        let archive = cb7(&sample_entries(), packing).unwrap();

        let reader = ArchiveReader::new(Cursor::new(archive), Password::empty()).unwrap();

        assert_eq!(reader.archive().blocks.len(), blocks, "{packing:?}");
    }
}

#[test]
fn generates_the_same_cb7_every_time() {
    let first = cb7(&sample_entries(), Packing::Solid).unwrap();

    let second = cb7(&sample_entries(), Packing::Solid).unwrap();

    assert_eq!(first, second);
}

#[test]
fn writes_an_empty_cb7_entry_as_a_file_with_no_stream() {
    let entries = [ArchiveEntry {
        name: "empty.png".to_owned(),
        bytes: Vec::new(),
    }];

    let archive = cb7(&entries, Packing::Solid).unwrap();

    let reader = ArchiveReader::new(Cursor::new(archive), Password::empty()).unwrap();
    let file = &reader.archive().files[0];
    assert_eq!(
        (file.name(), file.has_stream, file.is_directory),
        ("empty.png", false, false)
    );
}

#[test]
fn generates_the_same_incompressible_bytes_every_time() {
    let first = incompressible_bytes(SEED, 4096);

    let second = incompressible_bytes(SEED, 4096);

    assert_eq!((first.len(), &first), (4096, &second));
}

#[test]
fn makes_incompressible_bytes_that_deflate_cannot_shrink() {
    let bytes = incompressible_bytes(SEED, 64 * 1024);

    let mut deflated = flate2::write::DeflateEncoder::new(Vec::new(), flate2::Compression::best());
    std::io::Write::write_all(&mut deflated, &bytes).unwrap();
    let deflated = deflated.finish().unwrap();

    assert!(deflated.len() >= bytes.len(), "{} bytes", deflated.len());
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
