use std::ops::Range;

use crate::{
    ImagingError, Size, Transcoded,
    decode::{Decoded, Source},
    transcode::{Layout, Pixels, encode},
};

const CELL_EDGE: usize = 4;
const PAPER_TOLERANCE: u8 = 12;
const SPECK_TOLERANCE: u8 = 48;
const DARKEST_PAPER: u8 = 208;
const MOST_PAPER_TINT: u8 = 24;
const THINNEST_BORDER_SHARE: usize = 100;
const LEAST_KEPT_SHARE: usize = 2;

type Rgb = [u8; 3];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CroppedSides {
    All,
    LeftAndRight,
}

pub fn crop_white_borders(
    page: &[u8],
    sides: CroppedSides,
) -> Result<Option<Transcoded>, ImagingError> {
    let source = Source::probe(page)?;
    let decoded = source.decode(source.size)?;
    let Some(page) = Grid::of(&decoded) else {
        return Ok(None);
    };
    match kept_region(&page, sides).and_then(|kept| page.cropped_to(&kept)) {
        Some(cropped) => encode(&cropped).map(Some),
        None => Ok(None),
    }
}

fn kept_region(page: &Grid<'_, Rgb>, sides: CroppedSides) -> Option<Region> {
    let summed = page.cells();
    let cells = Grid {
        items: &summed,
        width: page.width.div_ceil(CELL_EDGE),
        height: page.height.div_ceil(CELL_EDGE),
    };
    let rows = match sides {
        CroppedSides::All => (cells.top_border(), cells.bottom_border()),
        CroppedSides::LeftAndRight => (0, 0),
    };
    let rows = kept_span(page.height, rows)?;
    let columns = kept_span(page.width, (cells.left_border(), cells.right_border()))?;
    let is_whole = rows == (0..page.height) && columns == (0..page.width);
    (!is_whole).then_some(Region { rows, columns })
}

fn kept_span(length: usize, (start_cells, end_cells): (usize, usize)) -> Option<Range<usize>> {
    let thinnest = length.div_ceil(THINNEST_BORDER_SHARE);
    let start = (start_cells * CELL_EDGE).min(length);
    let end = length
        .div_ceil(CELL_EDGE)
        .checked_sub(end_cells)?
        .saturating_mul(CELL_EDGE)
        .min(length);
    let start = if start < thinnest { 0 } else { start };
    let end = if length - end < thinnest { length } else { end };
    let kept = start..end;
    (kept.len() * LEAST_KEPT_SHARE >= length).then_some(kept)
}

#[derive(Clone, Copy)]
struct Cell {
    mean: Rgb,
    darkest: Rgb,
    lightest: Rgb,
}

struct CellSum {
    sums: [u64; 3],
    count: u64,
    darkest: Rgb,
    lightest: Rgb,
}

impl CellSum {
    const EMPTY: Self = Self {
        sums: [0; 3],
        count: 0,
        darkest: [u8::MAX; 3],
        lightest: [0; 3],
    };

    fn add(&mut self, [red, green, blue]: Rgb) {
        let [red_sum, green_sum, blue_sum] = self.sums;
        let [darkest_red, darkest_green, darkest_blue] = self.darkest;
        let [lightest_red, lightest_green, lightest_blue] = self.lightest;
        self.sums = [
            red_sum + u64::from(red),
            green_sum + u64::from(green),
            blue_sum + u64::from(blue),
        ];
        self.darkest = [
            darkest_red.min(red),
            darkest_green.min(green),
            darkest_blue.min(blue),
        ];
        self.lightest = [
            lightest_red.max(red),
            lightest_green.max(green),
            lightest_blue.max(blue),
        ];
        self.count += 1;
    }

    fn cell(&self) -> Cell {
        Cell {
            mean: self
                .sums
                .map(|sum| u8::try_from(sum / self.count.max(1)).unwrap_or(u8::MAX)),
            darkest: self.darkest,
            lightest: self.lightest,
        }
    }
}

#[derive(Clone, Copy)]
struct Paper(Rgb);

impl Paper {
    fn of(line: impl Iterator<Item = Cell>) -> Option<Self> {
        let mut summed = CellSum::EMPTY;
        for cell in line {
            summed.add(cell.mean);
        }
        let mean = summed.cell().mean;
        let darkest = mean.into_iter().min()?;
        let lightest = mean.into_iter().max()?;
        (darkest >= DARKEST_PAPER && lightest - darkest <= MOST_PAPER_TINT).then_some(Self(mean))
    }

    fn holds(self, cell: Cell) -> bool {
        self.is_within(cell.mean, PAPER_TOLERANCE)
            && self.is_within(cell.darkest, SPECK_TOLERANCE)
            && self.is_within(cell.lightest, SPECK_TOLERANCE)
    }

    fn is_within(self, colour: Rgb, tolerance: u8) -> bool {
        self.0
            .into_iter()
            .zip(colour)
            .all(|(paper, channel)| paper.abs_diff(channel) <= tolerance)
    }

    fn covers(self, line: &[Cell]) -> bool {
        line.iter().all(|cell| self.holds(*cell))
    }
}

struct Region {
    rows: Range<usize>,
    columns: Range<usize>,
}

struct Grid<'items, T> {
    items: &'items [T],
    width: usize,
    height: usize,
}

impl<'items, T: Copy> Grid<'items, T> {
    fn rows(&self) -> impl DoubleEndedIterator<Item = &'items [T]> + Clone {
        self.items.chunks_exact(self.width)
    }

    fn column(&self, at: usize) -> impl Iterator<Item = T> {
        self.rows().filter_map(move |row| row.get(at).copied())
    }
}

impl<'pixels> Grid<'pixels, Rgb> {
    fn of(decoded: &'pixels Decoded) -> Option<Self> {
        let width = usize::try_from(decoded.size.width).ok()?;
        let height = usize::try_from(decoded.size.height).ok()?;
        let (items, _) = decoded.rgb.as_chunks::<3>();
        (width > 0 && items.len() == width.checked_mul(height)?).then_some(Self {
            items,
            width,
            height,
        })
    }

    fn cells(&self) -> Vec<Cell> {
        let mut sums: Vec<CellSum> = (0..self.width.div_ceil(CELL_EDGE))
            .map(|_| CellSum::EMPTY)
            .collect();
        let mut cells = Vec::with_capacity(sums.len() * self.height.div_ceil(CELL_EDGE));
        for band in self.items.chunks(self.width * CELL_EDGE) {
            sums.fill_with(|| CellSum::EMPTY);
            for row in band.chunks_exact(self.width) {
                for (sum, pixels) in sums.iter_mut().zip(row.chunks(CELL_EDGE)) {
                    for pixel in pixels {
                        sum.add(*pixel);
                    }
                }
            }
            cells.extend(sums.iter().map(CellSum::cell));
        }
        cells
    }

    fn cropped_to(&self, kept: &Region) -> Option<Pixels> {
        let size = Size {
            width: u32::try_from(kept.columns.len()).ok()?,
            height: u32::try_from(kept.rows.len()).ok()?,
        };
        let mut samples = Vec::with_capacity(kept.rows.len() * kept.columns.len() * 3);
        for row in self.rows().skip(kept.rows.start).take(kept.rows.len()) {
            samples.extend_from_slice(row.get(kept.columns.clone())?.as_flattened());
        }
        Some(Pixels {
            size,
            layout: Layout::Rgb,
            samples,
        })
    }
}

impl Grid<'_, Cell> {
    fn top_border(&self) -> usize {
        border_rows(self.rows())
    }

    fn bottom_border(&self) -> usize {
        border_rows(self.rows().rev())
    }

    fn left_border(&self) -> usize {
        let Some(paper) = Paper::of(self.column(0)) else {
            return 0;
        };
        self.rows().fold(self.width, |border, row| {
            row.iter()
                .take(border)
                .position(|cell| !paper.holds(*cell))
                .unwrap_or(border)
        })
    }

    fn right_border(&self) -> usize {
        let Some(paper) = Paper::of(self.column(self.width.saturating_sub(1))) else {
            return 0;
        };
        self.rows().fold(self.width, |border, row| {
            row.iter()
                .rev()
                .take(border)
                .position(|cell| !paper.holds(*cell))
                .unwrap_or(border)
        })
    }
}

fn border_rows<'cells>(rows: impl Iterator<Item = &'cells [Cell]> + Clone) -> usize {
    let Some(paper) = rows
        .clone()
        .next()
        .and_then(|row| Paper::of(row.iter().copied()))
    else {
        return 0;
    };
    rows.take_while(|row| paper.covers(row)).count()
}
