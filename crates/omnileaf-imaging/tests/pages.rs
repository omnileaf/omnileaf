#![expect(
    clippy::unwrap_used,
    clippy::indexing_slicing,
    reason = "the pages are generated in memory, so a failure should stop the test"
)]

use std::io::Cursor;

use omnileaf_imaging::{ImagingError, PageFormat, Size, page_size, shrink_page, transcode};
use omnileaf_testkit::{
    ENCODED_PAGE_HEIGHT, ENCODED_PAGE_INK, ENCODED_PAGE_PAPER, ENCODED_PAGE_WIDTH,
    INK_OVER_CLEAR_JXL, INK_OVER_PAPER_AVIF, INK_OVER_PAPER_JXL, PageShape, jxl_header_only,
    page_jpeg, page_png, page_webp, strip_jpeg, webp_header_only,
};

const SEED: u64 = 5;
const COLOUR_TOLERANCE: u8 = 6;
const ENCODED_PAGE: Size = Size {
    width: ENCODED_PAGE_WIDTH,
    height: ENCODED_PAGE_HEIGHT,
};
const PORTRAIT: Size = Size {
    width: 400,
    height: 600,
};
const TRANSPARENT: u8 = 0;
const OPAQUE: u8 = u8::MAX;

fn gif_header(size: Size) -> Vec<u8> {
    let mut header = b"GIF89a".to_vec();
    header.extend_from_slice(&u16::try_from(size.width).unwrap().to_le_bytes());
    header.extend_from_slice(&u16::try_from(size.height).unwrap().to_le_bytes());
    header.extend_from_slice(&[0; 8]);
    header
}

fn bmp_header(size: Size) -> Vec<u8> {
    let mut header = b"BM".to_vec();
    header.extend_from_slice(&[0; 12]);
    header.extend_from_slice(&40_u32.to_le_bytes());
    header.extend_from_slice(&i32::try_from(size.width).unwrap().to_le_bytes());
    header.extend_from_slice(&i32::try_from(size.height).unwrap().to_le_bytes());
    header.extend_from_slice(&[0; 28]);
    header
}

fn portrait(
    encode: fn(u64, u32, PageShape) -> Result<Vec<u8>, omnileaf_testkit::FixtureError>,
) -> Vec<u8> {
    encode(SEED, 0, PageShape::Portrait).unwrap()
}

fn is_close(found: &[u8], expected: &[u8]) -> bool {
    found
        .iter()
        .zip(expected)
        .all(|(found, expected)| found.abs_diff(*expected) <= COLOUR_TOLERANCE)
}

fn decoded_jpeg(jpeg: &[u8]) -> (Size, Vec<u8>) {
    let mut decoder = jpeg_decoder::Decoder::new(jpeg);
    let pixels = decoder.decode().unwrap();
    let info = decoder.info().unwrap();
    let size = Size {
        width: u32::from(info.width),
        height: u32::from(info.height),
    };
    (size, pixels)
}

fn decoded_png(png: &[u8]) -> (Size, png::ColorType, Vec<u8>) {
    let mut reader = png::Decoder::new(Cursor::new(png)).read_info().unwrap();
    let mut pixels = vec![0; reader.output_buffer_size().unwrap()];
    let frame = reader.next_frame(&mut pixels).unwrap();
    let size = Size {
        width: frame.width,
        height: frame.height,
    };
    (size, frame.color_type, pixels)
}

fn pixel_at(pixels: &[u8], size: Size, channels: usize, (x, y): (u32, u32)) -> Vec<u8> {
    let start = usize::try_from(y * size.width + x).unwrap() * channels;
    pixels[start..start + channels].to_vec()
}

fn top_and_bottom(size: Size) -> [(u32, u32); 2] {
    [(size.width / 2, 1), (size.width / 2, size.height - 2)]
}

#[test]
fn tells_each_page_format_apart_by_its_first_bytes() {
    let pages = [
        portrait(page_jpeg),
        portrait(page_png),
        portrait(page_webp),
        gif_header(PORTRAIT),
        bmp_header(PORTRAIT),
        INK_OVER_PAPER_AVIF.to_vec(),
        INK_OVER_PAPER_JXL.to_vec(),
    ];

    let formats = pages.map(|page| PageFormat::sniff(&page));

    assert_eq!(
        formats,
        [
            Some(PageFormat::Jpeg),
            Some(PageFormat::Png),
            Some(PageFormat::Webp),
            Some(PageFormat::Gif),
            Some(PageFormat::Bmp),
            Some(PageFormat::Avif),
            Some(PageFormat::Jxl),
        ]
    );
}

#[test]
fn recognises_no_page_in_bytes_of_another_kind() {
    let formats = [
        PageFormat::sniff(b"<?xml version=\"1.0\"?><ComicInfo />"),
        PageFormat::sniff(&[]),
    ];

    assert_eq!(formats, [None, None]);
}

#[test]
fn reads_a_page_s_size_from_its_header_in_every_format() {
    let pages = [
        portrait(page_jpeg),
        portrait(page_png),
        portrait(page_webp),
        gif_header(PORTRAIT),
        bmp_header(PORTRAIT),
    ];

    let sizes = pages.map(|page| page_size(&page).unwrap());
    let encoded = [INK_OVER_PAPER_AVIF, INK_OVER_PAPER_JXL].map(|page| page_size(page).unwrap());

    assert_eq!(sizes, [PORTRAIT; 5]);
    assert_eq!(encoded, [ENCODED_PAGE; 2]);
}

#[test]
fn asks_for_more_of_a_page_whose_header_runs_past_the_bytes_read() {
    let jpeg = portrait(page_jpeg);

    let size = page_size(&jpeg[..20]);

    assert!(matches!(size, Err(ImagingError::Truncated)), "{size:?}");
}

#[test]
fn refuses_the_size_of_a_page_in_no_format_it_knows() {
    let size = page_size(b"<?xml version=\"1.0\"?><ComicInfo />");

    assert!(matches!(size, Err(ImagingError::Unsupported)), "{size:?}");
}

#[test]
fn transcodes_an_opaque_jpeg_xl_page_into_a_jpeg_of_the_same_page() {
    let transcoded = transcode(INK_OVER_PAPER_JXL).unwrap();

    assert_eq!(transcoded.format, PageFormat::Jpeg);
    let (size, pixels) = decoded_jpeg(&transcoded.bytes);
    assert_eq!(size, ENCODED_PAGE);
    let [top, bottom] = top_and_bottom(size).map(|at| pixel_at(&pixels, size, 3, at));
    assert!(is_close(&top, &ENCODED_PAGE_INK), "{top:?}");
    assert!(is_close(&bottom, &ENCODED_PAGE_PAPER), "{bottom:?}");
}

#[test]
fn transcodes_a_jpeg_xl_page_with_transparency_into_a_png_that_keeps_it() {
    let transcoded = transcode(INK_OVER_CLEAR_JXL).unwrap();

    assert_eq!(transcoded.format, PageFormat::Png);
    let (size, colour, pixels) = decoded_png(&transcoded.bytes);
    assert_eq!((size, colour), (ENCODED_PAGE, png::ColorType::Rgba));
    let [top, bottom] = top_and_bottom(size).map(|at| pixel_at(&pixels, size, 4, at));
    assert_eq!(top[3], OPAQUE);
    assert!(is_close(&top[..3], &ENCODED_PAGE_INK), "{top:?}");
    assert_eq!(bottom[3], TRANSPARENT);
}

#[test]
fn transcodes_a_webp_page_into_a_jpeg_of_the_same_size() {
    let transcoded = transcode(&portrait(page_webp)).unwrap();

    assert_eq!(transcoded.format, PageFormat::Jpeg);
    assert_eq!(decoded_jpeg(&transcoded.bytes).0, PORTRAIT);
}

#[test]
fn leaves_a_page_every_webview_shows_as_it_is() {
    let transcoded = transcode(&portrait(page_jpeg));

    assert!(
        matches!(
            transcoded,
            Err(ImagingError::NotTranscodable {
                format: PageFormat::Jpeg
            })
        ),
        "{transcoded:?}"
    );
}

#[test]
fn fails_to_transcode_a_jpeg_xl_page_cut_short() {
    let cut = &INK_OVER_PAPER_JXL[..INK_OVER_PAPER_JXL.len() / 2];

    let transcoded = transcode(cut);

    assert!(
        matches!(
            transcoded,
            Err(ImagingError::Transcode {
                format: PageFormat::Jxl,
                ..
            })
        ),
        "{transcoded:?}"
    );
}

#[test]
fn reads_the_size_a_jpeg_xl_header_claims() {
    let header = jxl_header_only(100_000, 70_000);

    let size = page_size(&header).unwrap();

    assert_eq!(
        size,
        Size {
            width: 100_000,
            height: 70_000
        }
    );
}

#[test]
fn refuses_to_transcode_a_webp_whose_pixels_outgrow_the_memory_budget_before_decoding_it() {
    let huge = webp_header_only(16_000, 16_000);

    let transcoded = transcode(&huge);

    assert!(
        matches!(transcoded, Err(ImagingError::TooLarge { .. })),
        "{transcoded:?}"
    );
}

#[test]
fn refuses_to_transcode_a_jpeg_xl_whose_pixels_outgrow_the_memory_budget_before_decoding_it() {
    let huge = jxl_header_only(100_000, 70_000);

    let transcoded = transcode(&huge);

    assert!(
        matches!(transcoded, Err(ImagingError::TooLarge { .. })),
        "{transcoded:?}"
    );
}

#[test]
fn shrinks_a_page_to_the_pixels_allowed_keeping_its_shape() {
    let page = portrait(page_png);

    let shrunk = shrink_page(&page, PORTRAIT.pixels() / 4).unwrap();

    assert_eq!(shrunk.format, PageFormat::Jpeg);
    assert_eq!(
        page_size(&shrunk.bytes).unwrap(),
        Size {
            width: PORTRAIT.width / 2,
            height: PORTRAIT.height / 2
        }
    );
}

#[test]
fn refuses_to_shrink_a_page_in_a_format_no_decoder_here_reads() {
    let gif = gif_header(Size {
        width: 60_000,
        height: 60_000,
    });

    let shrunk = shrink_page(&gif, PORTRAIT.pixels());

    assert!(
        matches!(shrunk, Err(ImagingError::Unsupported)),
        "{shrunk:?}"
    );
}

#[test]
fn refuses_to_shrink_a_page_whose_decode_would_outgrow_the_memory_budget() {
    let huge = webp_header_only(16_000, 16_000);

    let shrunk = shrink_page(&huge, PORTRAIT.pixels());

    assert!(
        matches!(shrunk, Err(ImagingError::TooLarge { .. })),
        "{shrunk:?}"
    );
}

#[test]
fn shrinks_a_jpeg_by_decoding_it_at_the_largest_built_in_scale_within_the_pixels_allowed() {
    let strip = strip_jpeg(400, 6000).unwrap();

    let shrunk = shrink_page(&strip, 1_000_000).unwrap();

    assert_eq!(shrunk.format, PageFormat::Jpeg);
    assert_eq!(
        page_size(&shrunk.bytes).unwrap(),
        Size {
            width: 200,
            height: 3000
        }
    );
}
