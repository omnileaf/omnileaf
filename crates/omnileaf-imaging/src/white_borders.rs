use std::ops::Range;

use crate::{
    ImagingError, Size, Transcoded,
    decode::{Decoded, Source},
    transcode::{Chroma, Layout, Pixels, encode_with_chroma},
};

pub(crate) const CELL_EDGE: usize = 4;
const PAPER_TOLERANCE: u8 = 12;
const SPECK_TOLERANCE: u8 = 48;
const DARKEST_PAPER: u8 = 208;
const MOST_PAPER_TINT: u8 = 24;
pub(crate) const THINNEST_BORDER_SHARE: usize = 100;
pub(crate) const LEAST_KEPT_SHARE: usize = 2;

pub(crate) type Rgb = [u8; 3];

pub fn crop_white_borders(page: &[u8]) -> Result<Option<Transcoded>, ImagingError> {
    let source = Source::probe(page)?;
    let decoded = source.decode(source.size)?;
    let Some(page) = Grid::of(&decoded) else {
        return Ok(None);
    };
    match kept_region(&page).and_then(|kept| page.cropped_to(&kept)) {
        Some(cropped) => encode_with_chroma(&cropped, Chroma::HalvedEachWay).map(Some),
        None => Ok(None),
    }
}

fn kept_region(page: &Grid<'_, Rgb>) -> Option<Region> {
    let cells = page.cells(CELL_EDGE);
    let cells = cells.grid();
    let rows = kept_span(page.height, (cells.top_border(), cells.bottom_border()))?;
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
pub(crate) struct Cell {
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

pub(crate) struct Region {
    pub(crate) rows: Range<usize>,
    pub(crate) columns: Range<usize>,
}

pub(crate) struct Grid<'items, T> {
    items: &'items [T],
    pub(crate) width: usize,
    pub(crate) height: usize,
}

pub(crate) struct Cells {
    items: Vec<Cell>,
    width: usize,
    height: usize,
}

impl Cells {
    pub(crate) fn grid(&self) -> Grid<'_, Cell> {
        Grid {
            items: &self.items,
            width: self.width,
            height: self.height,
        }
    }
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
    pub(crate) fn of(decoded: &'pixels Decoded) -> Option<Self> {
        let width = usize::try_from(decoded.size.width).ok()?;
        let height = usize::try_from(decoded.size.height).ok()?;
        let (items, _) = decoded.rgb.as_chunks::<3>();
        (width > 0 && items.len() == width.checked_mul(height)?).then_some(Self {
            items,
            width,
            height,
        })
    }

    pub(crate) fn cells(&self, edge: usize) -> Cells {
        let width = self.width.div_ceil(edge);
        let height = self.height.div_ceil(edge);
        let mut sums: Vec<CellSum> = (0..width).map(|_| CellSum::EMPTY).collect();
        let mut items = Vec::with_capacity(width * height);
        for band in self.items.chunks(self.width * edge) {
            sums.fill_with(|| CellSum::EMPTY);
            for row in band.chunks_exact(self.width) {
                for (sum, pixels) in sums.iter_mut().zip(row.chunks(edge)) {
                    for pixel in pixels {
                        sum.add(*pixel);
                    }
                }
            }
            items.extend(sums.iter().map(CellSum::cell));
        }
        Cells {
            items,
            width,
            height,
        }
    }

    pub(crate) fn cropped_to(&self, kept: &Region) -> Option<Pixels> {
        let size = Size {
            width: u32::try_from(kept.columns.len()).ok()?,
            height: u32::try_from(kept.rows.len()).ok()?,
        };
        let rows = self
            .rows()
            .skip(kept.rows.start)
            .take(kept.rows.len())
            .map(|row| row.get(kept.columns.clone()))
            .collect::<Option<Vec<_>>>()?;
        let is_grey = rows
            .iter()
            .copied()
            .flatten()
            .all(|[red, green, blue]| red == green && green == blue);
        let (layout, samples) = if is_grey {
            let levels = rows.iter().copied().flatten().map(|[level, ..]| *level);
            (Layout::Grey, levels.collect())
        } else {
            let channels = rows.iter().flat_map(|row| row.as_flattened());
            (Layout::Rgb, channels.copied().collect())
        };
        Some(Pixels {
            size,
            layout,
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

    pub(crate) fn left_border(&self) -> usize {
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

    pub(crate) fn right_border(&self) -> usize {
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
