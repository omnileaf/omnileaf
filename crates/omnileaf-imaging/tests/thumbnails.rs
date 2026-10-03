#![expect(
    clippy::unwrap_used,
    clippy::indexing_slicing,
    reason = "the images are generated in memory, so a failure should stop the test"
)]

use std::io::Cursor;

use omnileaf_imaging::{ImagingError, Size, THUMBNAIL_WIDTH, thumbnail};
use omnileaf_testkit::{PageShape, page_jpeg, page_png, page_webp, scan_jpeg};
use png::{BitDepth, ColorType, Encoder};

const SEED: u64 = 11;
const PAGE_WITH_ITS_BAND_AT_THE_FOOT: u32 = 9;
const COLOUR_TOLERANCE: u8 = 6;
const WHITE: [u8; 3] = [255; 3];
const SOF0_DIMENSIONS_OFFSET: usize = 5;

fn decoded(jpeg: &[u8]) -> (Size, Vec<u8>) {
    let mut decoder = jpeg_decoder::Decoder::new(jpeg);
    let pixels = decoder.decode().unwrap();
    let info = decoder.info().unwrap();
    let size = Size {
        width: u32::from(info.width),
        height: u32::from(info.height),
    };
    (size, pixels)
}

fn png_of(size: Size, colour: ColorType, pixel: &[u8]) -> Vec<u8> {
    let pixels = pixel.repeat(usize::try_from(size.width * size.height).unwrap());
    let mut bytes = Vec::new();
    let mut encoder = Encoder::new(&mut bytes, size.width, size.height);
    encoder.set_color(colour);
    encoder.set_depth(BitDepth::Eight);
    let mut writer = encoder.write_header().unwrap();
    writer.write_image_data(&pixels).unwrap();
    writer.finish().unwrap();
    bytes
}

fn centre_pixel(size: Size, rgb: &[u8]) -> [u8; 3] {
    let index = usize::try_from((size.height / 2 * size.width + size.width / 2) * 3).unwrap();
    rgb[index..index + 3].try_into().unwrap()
}

fn png_centre_pixel(png: &[u8]) -> [u8; 3] {
    let mut reader = png::Decoder::new(Cursor::new(png)).read_info().unwrap();
    let mut pixels = vec![0; reader.output_buffer_size().unwrap()];
    let info = reader.next_frame(&mut pixels).unwrap();
    centre_pixel(
        Size {
            width: info.width,
            height: info.height,
        },
        &pixels,
    )
}

fn is_close(left: [u8; 3], right: [u8; 3]) -> bool {
    left.iter()
        .zip(right)
        .all(|(left, right)| left.abs_diff(right) <= COLOUR_TOLERANCE)
}

fn with_sof0_size(jpeg: &[u8], width: u16, height: u16) -> Vec<u8> {
    let mut patched = jpeg.to_vec();
    let marker = patched
        .windows(2)
        .position(|pair| pair == [0xFF, 0xC0])
        .unwrap();
    let dimensions = marker + SOF0_DIMENSIONS_OFFSET;
    patched[dimensions..dimensions + 2].copy_from_slice(&height.to_be_bytes());
    patched[dimensions + 2..dimensions + 4].copy_from_slice(&width.to_be_bytes());
    patched
}

#[test]
fn makes_a_jpeg_thumbnail_320_px_wide_from_a_full_size_scan() {
    let scan = scan_jpeg(SEED).unwrap();

    let thumbnail = thumbnail(&scan).unwrap();

    let expected = Size {
        width: THUMBNAIL_WIDTH,
        height: 480,
    };
    assert_eq!(thumbnail.size, expected);
    assert_eq!(decoded(&thumbnail.jpeg).0, expected);
}

#[test]
fn makes_a_thumbnail_from_a_png_page() {
    let page = page_png(SEED, 0, PageShape::Portrait).unwrap();

    let thumbnail = thumbnail(&page).unwrap();

    assert_eq!(
        decoded(&thumbnail.jpeg).0,
        Size {
            width: 320,
            height: 480
        }
    );
}

#[test]
fn makes_a_thumbnail_from_a_webp_page() {
    let page = page_webp(SEED, 0, PageShape::Portrait).unwrap();

    let thumbnail = thumbnail(&page).unwrap();

    assert_eq!(
        decoded(&thumbnail.jpeg).0,
        Size {
            width: 320,
            height: 480
        }
    );
}

#[test]
fn keeps_the_shape_of_a_landscape_spread() {
    let spread = page_jpeg(SEED, 0, PageShape::Spread).unwrap();

    let thumbnail = thumbnail(&spread).unwrap();

    assert_eq!(
        thumbnail.size,
        Size {
            width: 320,
            height: 240
        }
    );
}

#[test]
fn keeps_a_page_narrower_than_a_thumbnail_at_its_own_size() {
    let size = Size {
        width: 200,
        height: 300,
    };
    let page = png_of(size, ColorType::Rgb, &[90, 120, 150]);

    let thumbnail = thumbnail(&page).unwrap();

    assert_eq!(decoded(&thumbnail.jpeg).0, size);
}

#[test]
fn shows_only_the_top_of_a_tall_strip() {
    let strip = png_of(
        Size {
            width: 400,
            height: 4000,
        },
        ColorType::Rgb,
        &[90, 120, 150],
    );

    let thumbnail = thumbnail(&strip).unwrap();

    assert_eq!(
        thumbnail.size,
        Size {
            width: 320,
            height: 640
        }
    );
}

#[test]
fn keeps_the_colours_of_the_page() {
    let page = page_png(SEED, PAGE_WITH_ITS_BAND_AT_THE_FOOT, PageShape::Portrait).unwrap();

    let thumbnail = thumbnail(&page).unwrap();

    let (size, pixels) = decoded(&thumbnail.jpeg);
    let shown = centre_pixel(size, &pixels);
    let drawn = png_centre_pixel(&page);
    assert!(
        is_close(shown, drawn),
        "the thumbnail shows {shown:?} where the page has {drawn:?}"
    );
}

#[test]
fn lays_a_transparent_page_on_white() {
    let page = png_of(
        Size {
            width: 400,
            height: 600,
        },
        ColorType::Rgba,
        &[20, 40, 60, 0],
    );

    let thumbnail = thumbnail(&page).unwrap();

    let (size, pixels) = decoded(&thumbnail.jpeg);
    let shown = centre_pixel(size, &pixels);
    assert!(is_close(shown, WHITE), "the thumbnail shows {shown:?}");
}

#[test]
fn refuses_an_image_in_a_format_it_cannot_read() {
    let gif = b"GIF89a\x01\x00\x01\x00\x00\x00\x00;";

    let outcome = thumbnail(gif);

    assert!(matches!(outcome, Err(ImagingError::Unsupported)));
}

#[test]
fn refuses_a_damaged_jpeg() {
    let damaged = [&[0xFF, 0xD8, 0xFF, 0xC0][..], &[0x13; 64]].concat();

    let outcome = thumbnail(&damaged);

    assert!(matches!(
        outcome,
        Err(ImagingError::Undecodable { .. } | ImagingError::Damaged { .. })
    ));
}

#[test]
fn refuses_an_image_larger_than_the_pixel_limit_before_decoding_it() {
    let page = page_jpeg(SEED, 0, PageShape::Portrait).unwrap();
    let huge = with_sof0_size(&page, 60_000, 60_000);

    let outcome = thumbnail(&huge);

    assert!(matches!(outcome, Err(ImagingError::TooLarge { .. })));
}
