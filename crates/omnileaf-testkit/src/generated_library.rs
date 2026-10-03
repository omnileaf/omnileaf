use std::path::{Path, PathBuf};

use crate::{ArchiveEntry, Compression, FixtureError, PageShape, cbz, library::write, page_png};

pub const GENERATED_LIBRARY_NAME: &str = "Generated Library";

const COVER_SEED: u64 = 0xC0FE;
const SHARED_PAGE_SEED: u64 = 0x5A3E;

/// A library of many small books for timing scans.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct GeneratedLibrary {
    pub series: u16,
    pub books_per_series: u16,
    pub pages_per_book: u16,
}

impl GeneratedLibrary {
    #[must_use]
    pub const fn books(self) -> u32 {
        self.series as u32 * self.books_per_series as u32
    }
}

/// Gives each book a cover of its own and the same remaining pages, so every book has its own fingerprint while only one page per book is drawn.
pub fn write_generated_library(
    root: &Path,
    library: GeneratedLibrary,
) -> Result<Vec<PathBuf>, FixtureError> {
    let shared_pages = (1..library.pages_per_book)
        .map(|page| {
            let bytes = page_png(SHARED_PAGE_SEED, u32::from(page), PageShape::Portrait)?;
            Ok(entry(page, bytes))
        })
        .collect::<Result<Vec<_>, FixtureError>>()?;
    let mut written = Vec::new();
    for series in 1..=library.series {
        let name = format!("Sample Series {series:03}");
        for book in 1..=library.books_per_series {
            let number = u64::from(series) << 16 | u64::from(book);
            let cover = entry(0, page_png(COVER_SEED ^ number, 0, PageShape::Portrait)?);
            let pages: Vec<ArchiveEntry> = [cover]
                .into_iter()
                .chain(shared_pages.iter().cloned())
                .collect();
            let path = Path::new(GENERATED_LIBRARY_NAME)
                .join(&name)
                .join(format!("{name} v{book:02}.cbz"));
            write(root, &path, &cbz(&pages, Compression::Stored)?)?;
            written.push(path);
        }
    }
    Ok(written)
}

fn entry(page: u16, bytes: Vec<u8>) -> ArchiveEntry {
    ArchiveEntry {
        name: format!("{:03}.png", u32::from(page) + 1),
        bytes,
    }
}
