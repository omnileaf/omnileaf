use std::{
    fs::File,
    io::Read,
    path::{Path, PathBuf},
};

use zip::{ZipArchive, result::ZipError};

use crate::{FormatError, Limits, Page, book::in_reading_order, is_ignored, is_page_image};

#[derive(Debug)]
pub struct ZipBook {
    path: PathBuf,
    archive: ZipArchive<File>,
    pages: Vec<Page>,
    entries: Vec<usize>,
    limits: Limits,
}

impl ZipBook {
    pub(crate) fn open(path: &Path, limits: &Limits) -> Result<Self, FormatError> {
        let file = File::open(path).map_err(|source| FormatError::Read {
            path: path.to_owned(),
            source,
        })?;
        let mut archive = ZipArchive::new(file).map_err(|source| corrupt(path, source))?;
        if archive.len() > limits.max_entries {
            return Err(FormatError::TooManyEntries {
                path: path.to_owned(),
                count: archive.len(),
                limit: limits.max_entries,
            });
        }
        let mut found = Vec::new();
        let mut total: u64 = 0;
        for index in 0..archive.len() {
            let entry = archive
                .by_index_raw(index)
                .map_err(|source| corrupt(path, source))?;
            if entry.is_dir() || is_ignored(entry.name()) || !is_page_image(entry.name()) {
                continue;
            }
            let page = Page {
                name: entry.name().to_owned(),
                size: entry.size(),
            };
            check_page(path, &page, entry.compressed_size(), limits)?;
            total = total.saturating_add(page.size);
            if total > limits.max_total_bytes {
                return Err(FormatError::TooLargeInTotal {
                    path: path.to_owned(),
                    limit: limits.max_total_bytes,
                });
            }
            found.push((page, index));
        }
        if found.is_empty() {
            return Err(FormatError::NoPages {
                path: path.to_owned(),
            });
        }
        let (pages, entries) = in_reading_order(found);
        Ok(Self {
            path: path.to_owned(),
            archive,
            pages,
            entries,
            limits: *limits,
        })
    }

    pub(crate) fn pages(&self) -> &[Page] {
        &self.pages
    }

    /// Reads one page, stopping past the size limit in case the archive understates it.
    pub(crate) fn read_page(&mut self, index: usize) -> Result<Vec<u8>, FormatError> {
        let (Some(&entry_index), Some(page)) = (self.entries.get(index), self.pages.get(index))
        else {
            return Err(FormatError::NoSuchPage {
                path: self.path.clone(),
                index,
            });
        };
        let name = page.name.clone();
        let limit = self.limits.max_page_bytes;
        let entry = self
            .archive
            .by_index(entry_index)
            .map_err(|source| corrupt(&self.path, source))?;
        let mut bytes = Vec::new();
        entry
            .take(limit.saturating_add(1))
            .read_to_end(&mut bytes)
            .map_err(|source| corrupt(&self.path, ZipError::Io(source)))?;
        if u64::try_from(bytes.len()).unwrap_or(u64::MAX) > limit {
            return Err(FormatError::PageTooLarge {
                path: self.path.clone(),
                name,
                limit,
            });
        }
        Ok(bytes)
    }
}

fn check_page(
    path: &Path,
    page: &Page,
    compressed: u64,
    limits: &Limits,
) -> Result<(), FormatError> {
    if page.size > limits.max_page_bytes {
        return Err(FormatError::PageTooLarge {
            path: path.to_owned(),
            name: page.name.clone(),
            limit: limits.max_page_bytes,
        });
    }
    let expands_too_far = match page.size.checked_div(compressed) {
        Some(ratio) => ratio > limits.max_compression_ratio,
        None => page.size > 0,
    };
    if expands_too_far {
        return Err(FormatError::SuspiciousCompression {
            path: path.to_owned(),
            name: page.name.clone(),
        });
    }
    Ok(())
}

fn corrupt(path: &Path, source: ZipError) -> FormatError {
    FormatError::Corrupt {
        path: path.to_owned(),
        source,
    }
}
