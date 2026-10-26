#![expect(
    clippy::unwrap_used,
    reason = "the pages are generated in memory, so a failure should stop the test"
)]

use omnileaf_imaging::{CroppedSides, ImagingError, PageFormat, Size, crop_white_borders};
use omnileaf_testkit::DrawnScan;
use png::{BitDepth, ColorType, Encoder};
use proptest::prelude::*;

const SCAN: DrawnScan = DrawnScan {
    width: 600,
    height: 900,
    seed: 11,
    grain: 12,
};
const HEAVY_GRAIN: u8 = 24;
const WHITE: [u8; 3] = [255, 255, 255];
const SCANNER_GREY: [u8; 3] = [228, 226, 222];
const INK: [u8; 3] = [40, 38, 36];
const LIGHT_TONE: [u8; 3] = [238, 238, 238];
const SHADOW: u8 = 170;
const DARKEST_PAPER: u8 = 128;
const MOST_PAPER_LEFT: u32 = 8;
const MARGINS: Margins = Margins {
    top: 60,
    right: 45,
    bottom: 75,
    left: 30,
};

#[derive(Clone, Copy, Debug)]
struct Margins {
    top: u32,
    right: u32,
    bottom: u32,
    left: u32,
}

impl Margins {
    const fn even(width: u32) -> Self {
        Self {
            top: width,
            right: width,
            bottom: width,
            left: width,
        }
    }

    fn surround(self, page: Size, (column, row): (u32, u32)) -> bool {
        column < self.left
            || row < self.top
            || column >= page.width - self.right
            || row >= page.height - self.bottom
    }

    fn content(self, page: Size) -> Size {
        Size {
            width: page.width - self.left - self.right,
            height: page.height - self.top - self.bottom,
        }
    }
}

#[derive(Debug)]
struct Inked {
    page: Size,
    ink: Size,
    paper_around: Margins,
}

fn scan_size() -> Size {
    Size {
        width: u32::from(SCAN.width),
        height: u32::from(SCAN.height),
    }
}

fn framed(margins: Margins, paper: [u8; 3]) -> Vec<u8> {
    SCAN.to_jpeg(|column, row| {
        if margins.surround(scan_size(), (column, row)) {
            paper
        } else {
            INK
        }
    })
    .unwrap()
}

fn inked(jpeg: &[u8]) -> Inked {
    let mut decoder = jpeg_decoder::Decoder::new(jpeg);
    let pixels = decoder.decode().unwrap();
    let info = decoder.info().unwrap();
    let page = Size {
        width: u32::from(info.width),
        height: u32::from(info.height),
    };
    let width = usize::from(info.width);
    let (pixels, _) = pixels.as_chunks::<3>();
    let ink: Vec<(u32, u32)> = pixels
        .iter()
        .enumerate()
        .filter(|(_, pixel)| pixel.iter().all(|channel| *channel < DARKEST_PAPER))
        .map(|(at, _)| {
            (
                u32::try_from(at % width).unwrap(),
                u32::try_from(at / width).unwrap(),
            )
        })
        .collect();
    let columns = ink.iter().map(|(column, _)| *column);
    let rows = ink.iter().map(|(_, row)| *row);
    let (left, right) = (columns.clone().min().unwrap(), columns.max().unwrap());
    let (top, bottom) = (rows.clone().min().unwrap(), rows.max().unwrap());
    Inked {
        page,
        ink: Size {
            width: right - left + 1,
            height: bottom - top + 1,
        },
        paper_around: Margins {
            top,
            right: page.width - 1 - right,
            bottom: page.height - 1 - bottom,
            left,
        },
    }
}

fn cropped(page: &[u8], sides: CroppedSides) -> Inked {
    let cropped = crop_white_borders(page, sides).unwrap().unwrap();
    assert_eq!(cropped.format, PageFormat::Jpeg);
    inked(&cropped.bytes)
}

fn is_close_around_ink(paper: u32) -> bool {
    paper <= MOST_PAPER_LEFT
}

fn png_of(size: Size, draw: impl Fn(u32, u32) -> [u8; 3]) -> Vec<u8> {
    let pixels: Vec<u8> = (0..size.height)
        .flat_map(|row| (0..size.width).map(move |column| (column, row)))
        .flat_map(|(column, row)| draw(column, row))
        .collect();
    let mut bytes = Vec::new();
    let mut encoder = Encoder::new(&mut bytes, size.width, size.height);
    encoder.set_color(ColorType::Rgb);
    encoder.set_depth(BitDepth::Eight);
    let mut writer = encoder.write_header().unwrap();
    writer.write_image_data(&pixels).unwrap();
    writer.finish().unwrap();
    bytes
}

#[test]
fn crops_a_white_margin_from_every_side_of_a_scan_up_to_its_ink() {
    let page = framed(MARGINS, WHITE);

    let cropped = cropped(&page, CroppedSides::All);

    assert_eq!(cropped.ink, MARGINS.content(scan_size()));
    let Margins {
        top,
        right,
        bottom,
        left,
    } = cropped.paper_around;
    assert!(
        [top, right, bottom, left]
            .into_iter()
            .all(is_close_around_ink),
        "{cropped:?}"
    );
}

#[test]
fn crops_a_margin_scanned_grey_rather_than_white() {
    let page = framed(MARGINS, SCANNER_GREY);

    let cropped = cropped(&page, CroppedSides::All);

    assert_eq!(cropped.ink, MARGINS.content(scan_size()));
    assert!(
        is_close_around_ink(cropped.paper_around.left),
        "{cropped:?}"
    );
}

#[test]
fn crops_a_margin_under_heavy_scanner_grain() {
    let grainy = DrawnScan {
        grain: HEAVY_GRAIN,
        ..SCAN
    };
    let page = grainy
        .to_jpeg(|column, row| {
            if MARGINS.surround(scan_size(), (column, row)) {
                WHITE
            } else {
                INK
            }
        })
        .unwrap();

    let cropped = cropped(&page, CroppedSides::All);

    assert_eq!(cropped.ink, MARGINS.content(scan_size()));
    assert!(is_close_around_ink(cropped.paper_around.top), "{cropped:?}");
}

#[test]
fn crops_only_the_left_and_right_of_a_page_of_a_long_strip() {
    let page = framed(MARGINS, WHITE);

    let cropped = cropped(&page, CroppedSides::LeftAndRight);

    assert_eq!(cropped.page.height, scan_size().height);
    assert_eq!(
        (cropped.paper_around.top, cropped.paper_around.bottom),
        (MARGINS.top, MARGINS.bottom)
    );
    assert!(
        is_close_around_ink(cropped.paper_around.left),
        "{cropped:?}"
    );
    assert!(
        is_close_around_ink(cropped.paper_around.right),
        "{cropped:?}"
    );
}

#[test]
fn stops_at_a_hairline_drawn_in_the_margin() {
    let hairline_row = 20;
    let page = SCAN
        .to_jpeg(|column, row| {
            let is_hairline = row == hairline_row && (100..500).contains(&column);
            if is_hairline || !MARGINS.surround(scan_size(), (column, row)) {
                INK
            } else {
                WHITE
            }
        })
        .unwrap();

    let cropped = cropped(&page, CroppedSides::All);

    assert_eq!(
        cropped.ink.height,
        scan_size().height - hairline_row - MARGINS.bottom
    );
    assert!(is_close_around_ink(cropped.paper_around.top), "{cropped:?}");
}

#[test]
fn stops_at_a_light_tone_beside_the_margin() {
    let tone_rows = MARGINS.top..MARGINS.top + 100;
    let page = SCAN
        .to_jpeg(|column, row| {
            if MARGINS.surround(scan_size(), (column, row)) {
                WHITE
            } else if tone_rows.contains(&row) {
                LIGHT_TONE
            } else {
                INK
            }
        })
        .unwrap();

    let cropped = cropped(&page, CroppedSides::All);

    let content = MARGINS.content(scan_size());
    assert!(
        (content.height..=content.height + 2 * MOST_PAPER_LEFT).contains(&cropped.page.height),
        "{cropped:?}"
    );
}

#[test]
fn keeps_every_side_a_shadow_falls_across() {
    let shadow_width = MARGINS.left;
    let page = SCAN
        .to_jpeg(|column, row| {
            if column < shadow_width {
                let lighter = (255 - u32::from(SHADOW)) * column / shadow_width;
                [SHADOW + u8::try_from(lighter).unwrap(); 3]
            } else if MARGINS.surround(scan_size(), (column, row)) {
                WHITE
            } else {
                INK
            }
        })
        .unwrap();

    let cropped = cropped(&page, CroppedSides::All);

    assert_eq!(cropped.page.height, scan_size().height);
    assert_eq!(
        (
            cropped.paper_around.top,
            cropped.paper_around.bottom,
            cropped.paper_around.left
        ),
        (MARGINS.top, MARGINS.bottom, MARGINS.left)
    );
    assert!(
        is_close_around_ink(cropped.paper_around.right),
        "{cropped:?}"
    );
}

#[test]
fn leaves_alone_a_page_without_a_near_white_border_worth_cropping() {
    let pages = [
        ("tinted", framed(MARGINS, [214, 232, 250])),
        ("too dark", framed(MARGINS, [190, 190, 190])),
        ("inked to its edges", framed(Margins::even(0), WHITE)),
        ("blank", SCAN.to_jpeg(|_, _| WHITE).unwrap()),
        ("too thin", framed(Margins::even(4), WHITE)),
        ("mostly margin", framed(Margins::even(250), WHITE)),
    ];

    let cropped: Vec<&str> = pages
        .iter()
        .filter(|(_, page)| {
            crop_white_borders(page, CroppedSides::All)
                .unwrap()
                .is_some()
        })
        .map(|(border, _)| *border)
        .collect();

    assert!(cropped.is_empty(), "{cropped:?}");
}

#[test]
fn refuses_to_crop_a_page_in_a_format_it_cannot_decode() {
    let gif = b"GIF89a\x10\x00\x10\x00\x00\x00\x00\x00\x00\x00\x00\x00";

    let cropped = crop_white_borders(gif, CroppedSides::All);

    assert!(
        matches!(cropped, Err(ImagingError::Unsupported)),
        "{cropped:?}"
    );
}

proptest! {
    #[test]
    fn never_crops_into_what_is_drawn_on_the_paper(
        width in 16_u32..96,
        height in 16_u32..96,
        margins in (0_u32..8, 0_u32..8, 0_u32..8, 0_u32..8),
        paper in 208_u8..=255,
    ) {
        let page_size = Size { width, height };
        let (top, right, bottom, left) = margins;
        let margins = Margins { top, right, bottom, left };
        let page = png_of(page_size, |column, row| {
            if margins.surround(page_size, (column, row)) { [paper; 3] } else { INK }
        });

        let cropped = crop_white_borders(&page, CroppedSides::All).unwrap();

        let content = margins.content(page_size);
        if let Some(cropped) = cropped {
            let inked = inked(&cropped.bytes);
            prop_assert!(inked.page.width >= content.width, "{inked:?}");
            prop_assert!(inked.page.height >= content.height, "{inked:?}");
            prop_assert_eq!(inked.ink, content);
        }
    }
}
