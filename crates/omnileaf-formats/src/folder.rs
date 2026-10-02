use std::{
    fs,
    path::{Path, PathBuf},
};

use crate::{FormatError, Limits, Page, book::in_reading_order, is_ignored, is_page_image};

/// A folder whose images, directly inside it, are one book's pages.
#[derive(Debug)]
pub struct FolderBook {
    path: PathBuf,
    pages: Vec<Page>,
    files: Vec<PathBuf>,
    limits: Limits,
}

impl FolderBook {
    pub(crate) fn open(path: &Path, limits: &Limits) -> Result<Self, FormatError> {
        let read_failed = |source| FormatError::Read {
            path: path.to_owned(),
            source,
        };
        let entries = fs::read_dir(path)
            .map_err(read_failed)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(read_failed)?;
        if entries.len() > limits.max_entries {
            return Err(FormatError::TooManyEntries {
                path: path.to_owned(),
                count: entries.len(),
                limit: limits.max_entries,
            });
        }
        let mut found = Vec::new();
        let mut total: u64 = 0;
        for entry in entries {
            let name = entry.file_name().to_string_lossy().into_owned();
            let metadata = entry.metadata().map_err(read_failed)?;
            if !metadata.is_file() || is_ignored(&name) || !is_page_image(&name) {
                continue;
            }
            if metadata.len() > limits.max_page_bytes {
                return Err(FormatError::PageTooLarge {
                    path: path.to_owned(),
                    name,
                    limit: limits.max_page_bytes,
                });
            }
            total = total.saturating_add(metadata.len());
            if total > limits.max_total_bytes {
                return Err(FormatError::TooLargeInTotal {
                    path: path.to_owned(),
                    limit: limits.max_total_bytes,
                });
            }
            found.push((
                Page {
                    name,
                    size: metadata.len(),
                },
                entry.path(),
            ));
        }
        if found.is_empty() {
            return Err(FormatError::NoPages {
                path: path.to_owned(),
            });
        }
        let (pages, files) = in_reading_order(found);
        Ok(Self {
            path: path.to_owned(),
            pages,
            files,
            limits: *limits,
        })
    }

    pub(crate) fn pages(&self) -> &[Page] {
        &self.pages
    }

    pub(crate) fn read_page(&self, index: usize) -> Result<Vec<u8>, FormatError> {
        let (Some(file), Some(page)) = (self.files.get(index), self.pages.get(index)) else {
            return Err(FormatError::NoSuchPage {
                path: self.path.clone(),
                index,
            });
        };
        let read_failed = |source| FormatError::Read {
            path: file.clone(),
            source,
        };
        if fs::metadata(file).map_err(read_failed)?.len() > self.limits.max_page_bytes {
            return Err(FormatError::PageTooLarge {
                path: self.path.clone(),
                name: page.name.clone(),
                limit: self.limits.max_page_bytes,
            });
        }
        fs::read(file).map_err(read_failed)
    }
}
