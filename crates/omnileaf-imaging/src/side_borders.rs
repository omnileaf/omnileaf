use crate::{
    ImageFormat, ImagingError, Size, Transcoded,
    decode::Source,
    transcode::{Chroma, encode_with_chroma},
    white_borders::{CELL_EDGE, Cell, Grid, LEAST_KEPT_SHARE, Region, THINNEST_BORDER_SHARE},
};

/// A JPEG codes its samples in blocks of 8 by 8, and decoded at an eighth of its size gives each block's mean as one pixel.
const JPEG_BLOCK_EDGE: usize = 8;
/// Ink reaching only partway into a JPEG block can leave the block's mean close enough to paper to pass for it.
const JPEG_BLOCKS_INK_CAN_HIDE_IN: usize = 1;
const SMALLEST_DECODE: Size = Size {
    width: 1,
    height: 1,
};
const STORED_LENGTH: usize = 16;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PageSideBorders(Measured);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Measured {
    Blank,
    Bordered { left: Share, right: Share },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct BookSideBorders {
    left: Share,
    right: Share,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct Share {
    pixels: u32,
    of_width: u32,
}

#[derive(Clone, Copy)]
enum Resolution {
    Full,
    JpegBlocks,
}

#[derive(Clone, Copy)]
struct CellBorders {
    left: usize,
    right: usize,
    across: usize,
}

struct PixelBorders {
    left: usize,
    right: usize,
}

pub fn measure_side_borders(page: &[u8]) -> Result<PageSideBorders, ImagingError> {
    let source = Source::probe(page)?;
    let resolution = match source.format {
        ImageFormat::Jpeg => Resolution::JpegBlocks,
        ImageFormat::Png | ImageFormat::Webp => Resolution::Full,
    };
    let decoded = source.decode(resolution.decoded_at_least(source.size))?;
    let damaged = || ImagingError::Damaged {
        format: source.format,
    };
    let pixels = Grid::of(&decoded).ok_or_else(damaged)?;
    let cells = CellBorders::of(&pixels.cells(resolution.decoded_cell_edge()).grid());
    if cells.is_blank() {
        return Ok(PageSideBorders(Measured::Blank));
    }
    let width = usize::try_from(source.size.width).map_err(|_| damaged())?;
    let borders = resolution.in_pixels(cells, width);
    Ok(PageSideBorders(Measured::Bordered {
        left: Share::of_page(borders.left, source.size.width),
        right: Share::of_page(borders.right, source.size.width),
    }))
}

pub fn crop_side_borders(
    page: &[u8],
    book: BookSideBorders,
) -> Result<Option<Transcoded>, ImagingError> {
    if book.crops_nothing() {
        return Ok(None);
    }
    let source = Source::probe(page)?;
    let decoded = source.decode(source.size)?;
    let Some(pixels) = Grid::of(&decoded) else {
        return Ok(None);
    };
    let own = Resolution::Full.in_pixels(
        CellBorders::of(&pixels.cells(CELL_EDGE).grid()),
        pixels.width,
    );
    let width = u32::try_from(pixels.width).unwrap_or(u32::MAX);
    let left = own.left.min(book.left.pixels_of(width));
    let right = own.right.min(book.right.pixels_of(width));
    if left == 0 && right == 0 {
        return Ok(None);
    }
    let kept = Region {
        rows: 0..pixels.height,
        columns: left..pixels.width.saturating_sub(right),
    };
    match pixels.cropped_to(&kept) {
        Some(cropped) => encode_with_chroma(&cropped, Chroma::HalvedEachWay).map(Some),
        None => Ok(None),
    }
}

impl CellBorders {
    fn of(cells: &Grid<'_, Cell>) -> Self {
        Self {
            left: cells.left_border(),
            right: cells.right_border(),
            across: cells.width,
        }
    }

    const fn is_blank(self) -> bool {
        self.left == self.across
    }
}

impl Resolution {
    fn decoded_at_least(self, page: Size) -> Size {
        match self {
            Self::Full => page,
            Self::JpegBlocks => SMALLEST_DECODE,
        }
    }

    const fn decoded_cell_edge(self) -> usize {
        match self {
            Self::Full => CELL_EDGE,
            Self::JpegBlocks => 1,
        }
    }

    const fn page_pixels_per_cell(self) -> usize {
        match self {
            Self::Full => CELL_EDGE,
            Self::JpegBlocks => JPEG_BLOCK_EDGE,
        }
    }

    const fn cells_ink_can_hide_in(self) -> usize {
        match self {
            Self::Full => 0,
            Self::JpegBlocks => JPEG_BLOCKS_INK_CAN_HIDE_IN,
        }
    }

    fn in_pixels(self, cells: CellBorders, width: usize) -> PixelBorders {
        let per_cell = self.page_pixels_per_cell();
        let hiding = self.cells_ink_can_hide_in();
        let left = cells
            .left
            .saturating_sub(hiding)
            .saturating_mul(per_cell)
            .min(width);
        let kept_end = cells
            .across
            .saturating_sub(cells.right)
            .saturating_add(hiding)
            .saturating_mul(per_cell)
            .min(width);
        PixelBorders {
            left,
            right: width - kept_end,
        }
    }
}

impl Share {
    const NONE: Self = Self {
        pixels: 0,
        of_width: 1,
    };

    fn of_page(pixels: usize, width: u32) -> Self {
        let pixels = u32::try_from(pixels).unwrap_or(u32::MAX).min(width);
        Self::stored(pixels, width).unwrap_or(Self::NONE)
    }

    fn stored(pixels: u32, of_width: u32) -> Option<Self> {
        (of_width > 0 && pixels <= of_width).then_some(Self { pixels, of_width })
    }

    fn narrower(self, other: Self) -> Self {
        let this = u64::from(self.pixels) * u64::from(other.of_width);
        let that = u64::from(other.pixels) * u64::from(self.of_width);
        if this <= that { self } else { other }
    }

    fn is_too_thin(self) -> bool {
        u64::from(self.pixels) * as_u64(THINNEST_BORDER_SHARE) < u64::from(self.of_width)
    }

    fn pixels_of(self, width: u32) -> usize {
        let pixels = u64::from(self.pixels) * u64::from(width) / u64::from(self.of_width);
        usize::try_from(pixels).unwrap_or(usize::MAX)
    }
}

impl BookSideBorders {
    const NONE: Self = Self {
        left: Share::NONE,
        right: Share::NONE,
    };

    pub fn of_pages(pages: impl IntoIterator<Item = PageSideBorders>) -> Self {
        let narrowest = pages
            .into_iter()
            .filter_map(|PageSideBorders(page)| match page {
                Measured::Blank => None,
                Measured::Bordered { left, right } => Some((left, right)),
            })
            .reduce(|(left, right), (next_left, next_right)| {
                (left.narrower(next_left), right.narrower(next_right))
            });
        let Some(sides) = narrowest else {
            return Self::NONE;
        };
        let [left, right] = <[Share; 2]>::from(sides).map(|side| {
            if side.is_too_thin() {
                Share::NONE
            } else {
                side
            }
        });
        let book = Self { left, right };
        if book.keeps_enough() {
            book
        } else {
            Self::NONE
        }
    }

    #[must_use]
    pub fn to_bytes(self) -> [u8; STORED_LENGTH] {
        let Self { left, right } = self;
        let words = [left.pixels, left.of_width, right.pixels, right.of_width];
        let mut bytes = [0; STORED_LENGTH];
        for (stored, word) in bytes.as_chunks_mut::<4>().0.iter_mut().zip(words) {
            *stored = word.to_le_bytes();
        }
        bytes
    }

    #[must_use]
    pub fn from_bytes(bytes: &[u8]) -> Option<Self> {
        let (words, []) = bytes.as_chunks::<4>() else {
            return None;
        };
        let &[left_pixels, left_width, right_pixels, right_width] = words else {
            return None;
        };
        let book = Self {
            left: Share::stored(
                u32::from_le_bytes(left_pixels),
                u32::from_le_bytes(left_width),
            )?,
            right: Share::stored(
                u32::from_le_bytes(right_pixels),
                u32::from_le_bytes(right_width),
            )?,
        };
        book.keeps_enough().then_some(book)
    }

    fn crops_nothing(self) -> bool {
        self.left.pixels == 0 && self.right.pixels == 0
    }

    fn keeps_enough(self) -> bool {
        let Self { left, right } = self;
        let cut = u128::from(left.pixels) * u128::from(right.of_width)
            + u128::from(right.pixels) * u128::from(left.of_width);
        let whole = u128::from(left.of_width) * u128::from(right.of_width);
        whole.saturating_sub(cut) * as_u128(LEAST_KEPT_SHARE) >= whole
    }
}

fn as_u64(count: usize) -> u64 {
    u64::try_from(count).unwrap_or(u64::MAX)
}

fn as_u128(count: usize) -> u128 {
    u128::try_from(count).unwrap_or(u128::MAX)
}
