use std::{
    fs::File,
    path::{Path, PathBuf},
    sync::Arc,
};

use omnileaf_sync_proto::Fingerprint;
use zip::{ZipArchive, result::ZipError};

use crate::{
    FormatError, Limits, Page,
    block_reader::BlockReader,
    book::in_reading_order,
    error::read_failed,
    fingerprint::archive_fingerprint,
    is_ignored, is_page_image,
    limits::{COMIC_INFO_LIMIT, COMIC_INFO_NAME, read_within},
};

#[derive(Debug)]
pub struct ZipBook {
    path: PathBuf,
    /// Shared with the archive's reader, which seeks before every read, so sampling it never moves the reader.
    file: Arc<File>,
    archive: ZipArchive<BlockReader<Arc<File>>>,
    pages: Vec<Page>,
    entries: Vec<usize>,
    limits: Limits,
}

impl ZipBook {
    pub(crate) fn from_file(file: File, path: &Path, limits: &Limits) -> Result<Self, FormatError> {
        let file = Arc::new(file);
        let mut archive = archive_from(Arc::clone(&file), path, limits)?;
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
            file,
            archive,
            pages,
            entries,
            limits: *limits,
        })
    }

    pub(crate) fn pages(&self) -> &[Page] {
        &self.pages
    }

    pub(crate) fn path(&self) -> &Path {
        &self.path
    }

    pub(crate) fn fingerprint(&mut self) -> Result<Fingerprint, FormatError> {
        archive_fingerprint(&self.path, &mut self.archive, &*self.file)
    }

    pub(crate) fn read_comic_info(&mut self) -> Result<Option<Vec<u8>>, FormatError> {
        let Some(name) = self
            .archive
            .file_names()
            .find(|name| name.eq_ignore_ascii_case(COMIC_INFO_NAME))
            .map(ToOwned::to_owned)
        else {
            return Ok(None);
        };
        let entry = self
            .archive
            .by_name(&name)
            .map_err(|source| corrupt(&self.path, source))?;
        read_within(entry, COMIC_INFO_LIMIT)
            .map_err(|source| corrupt(&self.path, ZipError::Io(source)))?
            .map(Some)
            .ok_or_else(|| FormatError::ComicInfoTooLarge {
                path: self.path.clone(),
                limit: COMIC_INFO_LIMIT,
            })
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
        let limit = self.limits.max_page_bytes;
        let entry = self
            .archive
            .by_index(entry_index)
            .map_err(|source| corrupt(&self.path, source))?;
        read_within(entry, limit)
            .map_err(|source| corrupt(&self.path, ZipError::Io(source)))?
            .ok_or_else(|| FormatError::PageTooLarge {
                path: self.path.clone(),
                name: page.name.clone(),
                limit,
            })
    }
}

/// Reads the archive's central directory, refusing more entries than the limits allow.
pub(crate) fn archive_from(
    file: Arc<File>,
    path: &Path,
    limits: &Limits,
) -> Result<ZipArchive<BlockReader<Arc<File>>>, FormatError> {
    let reader = BlockReader::new(file).map_err(read_failed(path))?;
    let archive = ZipArchive::new(reader).map_err(|source| corrupt(path, source))?;
    if archive.len() > limits.max_entries {
        return Err(FormatError::TooManyEntries {
            path: path.to_owned(),
            count: archive.len(),
            limit: limits.max_entries,
        });
    }
    Ok(archive)
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

pub(crate) fn corrupt(path: &Path, source: ZipError) -> FormatError {
    FormatError::Corrupt {
        path: path.to_owned(),
        source,
    }
}
