use std::{
    fs,
    path::{Path, PathBuf},
};

use crate::{ArchiveEntry, Compression, FixtureError, PageShape, cbz, page_png};

pub const SAMPLE_LIBRARY_NAME: &str = "Sample Library";

const LIBRARY_SEED: u64 = 0x5EED;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SeriesLayout {
    Archives(Compression),
    ImageFolders,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SeriesSpec {
    pub name: &'static str,
    pub layout: SeriesLayout,
    pub books: u16,
    pub pages_per_book: u16,
    pub spread_pages: &'static [u16],
}

impl SeriesSpec {
    fn pages(&self, seed: u64) -> Result<Vec<ArchiveEntry>, FixtureError> {
        (0..self.pages_per_book)
            .map(|page| {
                let shape = if self.spread_pages.contains(&page) {
                    PageShape::Spread
                } else {
                    PageShape::Portrait
                };
                Ok(ArchiveEntry {
                    name: format!("{:03}.png", page + 1),
                    bytes: page_png(seed, u32::from(page), shape)?,
                })
            })
            .collect()
    }
}

pub const SAMPLE_LIBRARY: &[SeriesSpec] = &[
    SeriesSpec {
        name: "Sample Series 01",
        layout: SeriesLayout::Archives(Compression::Stored),
        books: 3,
        pages_per_book: 8,
        spread_pages: &[4],
    },
    SeriesSpec {
        name: "Sample Series 02",
        layout: SeriesLayout::Archives(Compression::Deflated),
        books: 2,
        pages_per_book: 12,
        spread_pages: &[],
    },
    SeriesSpec {
        name: "Sample Series 03",
        layout: SeriesLayout::ImageFolders,
        books: 2,
        pages_per_book: 6,
        spread_pages: &[],
    },
];

/// Writes the sample library into `root` and returns the files written, relative to `root` and sorted.
pub fn write_sample_library(root: &Path) -> Result<Vec<PathBuf>, FixtureError> {
    let mut written = Vec::new();
    for (series, series_seed) in SAMPLE_LIBRARY.iter().zip(LIBRARY_SEED..) {
        let series_folder = Path::new(SAMPLE_LIBRARY_NAME).join(series.name);
        for book in 1..=series.books {
            let pages = series.pages(series_seed.wrapping_mul(u64::from(book)))?;
            match series.layout {
                SeriesLayout::Archives(compression) => {
                    let path = series_folder.join(format!("{} v{book:02}.cbz", series.name));
                    write(root, &path, &cbz(&pages, compression)?)?;
                    written.push(path);
                }
                SeriesLayout::ImageFolders => {
                    let chapter = series_folder.join(format!("Chapter {book:02}"));
                    for page in pages {
                        let path = chapter.join(&page.name);
                        write(root, &path, &page.bytes)?;
                        written.push(path);
                    }
                }
            }
        }
    }
    written.sort();
    Ok(written)
}

fn write(root: &Path, relative: &Path, bytes: &[u8]) -> Result<(), FixtureError> {
    let path = root.join(relative);
    let failed = |source| FixtureError::Write {
        path: path.clone(),
        source,
    };
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(failed)?;
    }
    fs::write(&path, bytes).map_err(failed)
}
