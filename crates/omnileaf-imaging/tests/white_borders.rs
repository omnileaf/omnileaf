#![expect(
    clippy::unwrap_used,
    clippy::indexing_slicing,
    reason = "the pages are generated in memory, so a failure should stop the test"
)]

use std::ops::Range;

use jpeg_decoder::PixelFormat;
use omnileaf_imaging::{
    BookSideBorders, ImagingError, PageFormat, Size, crop_side_borders, crop_white_borders,
    measure_side_borders, page_size,
};
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
const GREY_INK: [u8; 3] = [40; 3];
const RED_INK: [u8; 3] = [200, 40, 40];
const SOF0: [u8; 2] = [0xFF, 0xC0];
const SOF0_COMPONENT_COUNT_OFFSET: usize = 9;
const SOF0_COMPONENT_LENGTH: usize = 3;
const TWICE_EACH_WAY: u8 = 0x22;
const ONCE_EACH_WAY: u8 = 0x11;
const LIGHT_TONE: [u8; 3] = [238, 238, 238];
const SHADOW: u8 = 170;
const DARKEST_PAPER: u8 = 128;
const MOST_PAPER_LEFT: u32 = 8;
const MOST_PAPER_LEFT_BESIDE_A_BOOK_CROP: u32 = 16;
const SPECK_COLUMN: u32 = 20;
const SPECK_ROWS: Range<u32> = 100..800;
const SPECK_SPACING: u32 = 8;
const PALE_TONE: [u8; 3] = [229; 3];
const PALE_TONE_WIDTH: u32 = 16;
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

fn decoded_rgb(jpeg: &[u8]) -> (Size, Vec<u8>) {
    let mut decoder = jpeg_decoder::Decoder::new(jpeg);
    let pixels = decoder.decode().unwrap();
    let info = decoder.info().unwrap();
    let size = Size {
        width: u32::from(info.width),
        height: u32::from(info.height),
    };
    match info.pixel_format {
        PixelFormat::L8 => (size, pixels.iter().flat_map(|level| [*level; 3]).collect()),
        PixelFormat::RGB24 | PixelFormat::L16 | PixelFormat::CMYK32 => (size, pixels),
    }
}

fn pixel_format(jpeg: &[u8]) -> PixelFormat {
    let mut decoder = jpeg_decoder::Decoder::new(jpeg);
    decoder.read_info().unwrap();
    decoder.info().unwrap().pixel_format
}

fn sampling_factors(jpeg: &[u8]) -> Vec<u8> {
    let marker = jpeg.windows(2).position(|pair| pair == SOF0).unwrap();
    let count_at = marker + SOF0_COMPONENT_COUNT_OFFSET;
    jpeg[count_at + 1..]
        .chunks(SOF0_COMPONENT_LENGTH)
        .take(usize::from(jpeg[count_at]))
        .map(|component| component[1])
        .collect()
}

fn inked(jpeg: &[u8]) -> Inked {
    let (page, pixels) = decoded_rgb(jpeg);
    let width = usize::try_from(page.width).unwrap();
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

fn cropped(page: &[u8]) -> Inked {
    let cropped = crop_white_borders(page).unwrap().unwrap();
    assert_eq!(cropped.format, PageFormat::Jpeg);
    inked(&cropped.bytes)
}

fn is_close_around_ink(paper: u32) -> bool {
    paper <= MOST_PAPER_LEFT
}

fn book_borders(pages: &[Vec<u8>]) -> BookSideBorders {
    BookSideBorders::of_pages(pages.iter().map(|page| measure_side_borders(page).unwrap()))
}

fn side_cropped(pages: &[Vec<u8>]) -> Vec<Option<Vec<u8>>> {
    let book = book_borders(pages);
    pages
        .iter()
        .map(|page| {
            crop_side_borders(page, book)
                .unwrap()
                .map(|cropped| cropped.bytes)
        })
        .collect()
}

fn side_cropped_inked(pages: &[Vec<u8>]) -> Vec<Inked> {
    side_cropped(pages)
        .iter()
        .map(|cropped| inked(cropped.as_ref().unwrap()))
        .collect()
}

fn cut_away(page: Margins, cropped: &Inked) -> (u32, u32) {
    (
        page.left - cropped.paper_around.left,
        page.right - cropped.paper_around.right,
    )
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

    let cropped = cropped(&page);

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

    let cropped = cropped(&page);

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

    let cropped = cropped(&page);

    assert_eq!(cropped.ink, MARGINS.content(scan_size()));
    assert!(is_close_around_ink(cropped.paper_around.top), "{cropped:?}");
}

#[test]
fn crops_a_grey_page_into_a_grey_jpeg() {
    let page = png_of(scan_size(), |column, row| {
        if MARGINS.surround(scan_size(), (column, row)) {
            WHITE
        } else {
            GREY_INK
        }
    });

    let cropped = crop_white_borders(&page).unwrap().unwrap();

    assert_eq!(pixel_format(&cropped.bytes), PixelFormat::L8);
}

#[test]
fn halves_the_chroma_of_a_colour_page_it_crops_each_way() {
    let page = SCAN
        .to_jpeg(|column, row| {
            if MARGINS.surround(scan_size(), (column, row)) {
                WHITE
            } else {
                RED_INK
            }
        })
        .unwrap();

    let cropped = crop_white_borders(&page).unwrap().unwrap();

    assert_eq!(
        sampling_factors(&cropped.bytes),
        [TWICE_EACH_WAY, ONCE_EACH_WAY, ONCE_EACH_WAY]
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

    let cropped = cropped(&page);

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

    let cropped = cropped(&page);

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

    let cropped = cropped(&page);

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
        .filter(|(_, page)| crop_white_borders(page).unwrap().is_some())
        .map(|(border, _)| *border)
        .collect();

    assert!(cropped.is_empty(), "{cropped:?}");
}

#[test]
fn refuses_to_crop_a_page_in_a_format_it_cannot_decode() {
    let gif = b"GIF89a\x10\x00\x10\x00\x00\x00\x00\x00\x00\x00\x00\x00";

    let cropped = crop_white_borders(gif);

    assert!(
        matches!(cropped, Err(ImagingError::Unsupported)),
        "{cropped:?}"
    );
}

#[test]
fn crops_only_the_left_and_right_of_the_pages_of_a_long_strip() {
    let page = framed(MARGINS, WHITE);

    let cropped = side_cropped_inked(&[page]).remove(0);

    assert_eq!(cropped.page.height, scan_size().height);
    assert_eq!(
        (cropped.paper_around.top, cropped.paper_around.bottom),
        (MARGINS.top, MARGINS.bottom)
    );
    assert!(
        cropped.paper_around.left <= MOST_PAPER_LEFT_BESIDE_A_BOOK_CROP,
        "{cropped:?}"
    );
    assert!(
        cropped.paper_around.right <= MOST_PAPER_LEFT_BESIDE_A_BOOK_CROP,
        "{cropped:?}"
    );
}

#[test]
fn crops_every_page_of_a_book_by_the_narrowest_left_and_right_borders_among_them() {
    let margins = [
        Margins {
            left: 30,
            right: 90,
            ..MARGINS
        },
        Margins {
            left: 80,
            right: 45,
            ..MARGINS
        },
    ];
    let pages = margins.map(|page| framed(page, WHITE));

    let cropped = side_cropped_inked(&pages);

    let [first, second] = [0, 1].map(|page| cut_away(margins[page], &cropped[page]));
    assert_eq!(first, second, "{cropped:?}");
    assert!(
        cropped[0].paper_around.left <= MOST_PAPER_LEFT_BESIDE_A_BOOK_CROP,
        "{cropped:?}"
    );
    assert!(
        cropped[1].paper_around.right <= MOST_PAPER_LEFT_BESIDE_A_BOOK_CROP,
        "{cropped:?}"
    );
}

#[test]
fn crops_a_wider_page_of_a_book_by_the_same_share_of_its_width() {
    let narrow = framed(Margins::even(40), WHITE);
    let wide_scan = DrawnScan {
        width: SCAN.width * 2,
        ..SCAN
    };
    let wide_size = Size {
        width: u32::from(wide_scan.width),
        height: u32::from(wide_scan.height),
    };
    let wide = wide_scan
        .to_jpeg(|column, row| {
            if Margins::even(120).surround(wide_size, (column, row)) {
                WHITE
            } else {
                INK
            }
        })
        .unwrap();

    let cropped = side_cropped_inked(&[narrow, wide]);

    assert!(cropped[0].page.width < scan_size().width, "{cropped:?}");
    assert_eq!(
        cropped[1].page.width,
        2 * cropped[0].page.width,
        "{cropped:?}"
    );
}

#[test]
fn crops_every_page_of_a_book_alike_where_a_pale_tone_begins_partway_into_a_measured_block() {
    let toned_from = [45, 61];
    let pages = toned_from.map(|left| {
        SCAN.to_jpeg(|column, row| {
            let margins = Margins { left, ..MARGINS };
            if margins.surround(scan_size(), (column, row)) {
                WHITE
            } else if column < left + PALE_TONE_WIDTH {
                PALE_TONE
            } else {
                INK
            }
        })
        .unwrap()
    });

    let cropped = side_cropped_inked(&pages);

    let cuts = [0, 1].map(|page| {
        let inked_from = Margins {
            left: toned_from[page] + PALE_TONE_WIDTH,
            ..MARGINS
        };
        cut_away(inked_from, &cropped[page])
    });
    assert_eq!(cuts[0], cuts[1], "{cropped:?}");
}

#[test]
fn crops_nothing_from_the_side_of_a_book_one_of_its_pages_is_inked_to() {
    let margins = [MARGINS, Margins { left: 0, ..MARGINS }];
    let pages = margins.map(|page| framed(page, WHITE));

    let cropped = side_cropped_inked(&pages);

    let cuts = [0, 1].map(|page| cut_away(margins[page], &cropped[page]));
    assert_eq!(cuts.map(|(left, _)| left), [0, 0], "{cropped:?}");
    assert!(cuts[0].1 > 0 && cuts[0].1 == cuts[1].1, "{cropped:?}");
}

#[test]
fn crops_a_blank_page_of_a_book_as_much_as_the_pages_with_ink() {
    let pages = [SCAN.to_jpeg(|_, _| WHITE).unwrap(), framed(MARGINS, WHITE)];

    let cropped = side_cropped(&pages);

    let widths = cropped
        .iter()
        .map(|page| page_size(page.as_ref().unwrap()).unwrap().width)
        .collect::<Vec<_>>();
    assert!(widths[1] < scan_size().width, "{widths:?}");
    assert_eq!(widths[0], widths[1]);
}

#[test]
fn never_crops_a_page_of_a_book_past_specks_too_small_to_measure() {
    let specked = SCAN
        .to_jpeg(|column, row| {
            let is_speck = column == SPECK_COLUMN
                && SPECK_ROWS.contains(&row)
                && row.is_multiple_of(SPECK_SPACING);
            if is_speck {
                [0; 3]
            } else if Margins::even(48).surround(scan_size(), (column, row)) {
                WHITE
            } else {
                INK
            }
        })
        .unwrap();
    let pages = [specked, framed(Margins::even(48), WHITE)];

    let cropped = side_cropped_inked(&pages);

    assert!(
        cropped[0].ink.width >= scan_size().width - 48 - SPECK_COLUMN,
        "{cropped:?}"
    );
}

#[test]
fn crops_nothing_from_a_book_without_a_near_white_side_border_worth_cropping() {
    let books = [
        ("tinted", vec![framed(MARGINS, [214, 232, 250])]),
        ("too dark", vec![framed(MARGINS, [190, 190, 190])]),
        ("inked to its edges", vec![framed(Margins::even(0), WHITE)]),
        ("blank", vec![SCAN.to_jpeg(|_, _| WHITE).unwrap()]),
        ("too thin", vec![framed(Margins::even(4), WHITE)]),
        ("mostly margin", vec![framed(Margins::even(250), WHITE)]),
        (
            "beside a page inked to its edges",
            vec![framed(MARGINS, WHITE), framed(Margins::even(0), WHITE)],
        ),
    ];

    let cropped: Vec<&str> = books
        .iter()
        .filter(|(_, pages)| side_cropped(pages).iter().any(Option::is_some))
        .map(|(book, _)| *book)
        .collect();

    assert!(cropped.is_empty(), "{cropped:?}");
}

#[test]
fn reads_back_the_side_borders_it_wrote() {
    let book = book_borders(&[framed(MARGINS, WHITE)]);

    let read = BookSideBorders::from_bytes(&book.to_bytes());

    assert_eq!(read, Some(book));
}

#[test]
fn refuses_side_borders_it_never_wrote() {
    let share = |pixels: u32, of_width: u32| [pixels.to_le_bytes(), of_width.to_le_bytes()];
    let stored = |left: [[u8; 4]; 2], right: [[u8; 4]; 2]| [left, right].as_flattened().concat();
    let unwritten = [
        Vec::new(),
        stored(share(30, 600), share(45, 600))[..15].to_vec(),
        stored(share(0, 0), share(45, 600)),
        stored(share(30, 600), share(601, 600)),
        stored(share(200, 600), share(200, 600)),
    ];

    let read = unwritten.map(|bytes| BookSideBorders::from_bytes(&bytes));

    assert_eq!(read, [None; 5]);
}

#[test]
fn refuses_to_measure_a_page_in_a_format_it_cannot_decode() {
    let gif = b"GIF89a\x10\x00\x10\x00\x00\x00\x00\x00\x00\x00\x00\x00";

    let measured = measure_side_borders(gif);

    assert!(
        matches!(measured, Err(ImagingError::Unsupported)),
        "{measured:?}"
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

        let cropped = crop_white_borders(&page).unwrap();

        let content = margins.content(page_size);
        if let Some(cropped) = cropped {
            let inked = inked(&cropped.bytes);
            prop_assert!(inked.page.width >= content.width, "{inked:?}");
            prop_assert!(inked.page.height >= content.height, "{inked:?}");
            prop_assert_eq!(inked.ink, content);
        }
    }
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(48))]

    #[test]
    fn crops_every_page_of_a_book_to_one_width_without_cutting_into_its_ink(
        width in 48_u16..200,
        height in 48_u16..120,
        margins in prop::collection::vec((0_u32..24, 0_u32..24), 2..4),
    ) {
        let scan = DrawnScan { width, height, ..SCAN };
        let size = Size { width: u32::from(width), height: u32::from(height) };
        let margins: Vec<Margins> = margins
            .into_iter()
            .map(|(left, right)| Margins { top: 4, right, bottom: 4, left })
            .collect();
        let pages: Vec<Vec<u8>> = margins
            .iter()
            .map(|page| {
                scan.to_jpeg(|column, row| if page.surround(size, (column, row)) { WHITE } else { INK })
                    .unwrap()
            })
            .collect();

        let cropped = side_cropped(&pages);

        if cropped.iter().any(Option::is_some) {
            prop_assert!(cropped.iter().all(Option::is_some));
            let inked: Vec<Inked> = cropped.iter().map(|page| inked(page.as_ref().unwrap())).collect();
            for (page, inked) in margins.iter().zip(&inked) {
                prop_assert_eq!(inked.ink, page.content(size));
            }
            prop_assert!(inked.iter().all(|page| page.page.width == inked[0].page.width), "{inked:?}");
        }
    }
}
