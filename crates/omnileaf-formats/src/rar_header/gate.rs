use std::path::Path;

use super::{RarEntry, RarFormat, RarListing};
use crate::{FormatError, Limits, Page, book::in_reading_order, entries::is_contained_page};

pub(super) const MAX_NAME_CHARS: usize = 2048;

pub(super) struct FileHeader {
    pub(super) name: String,
    pub(super) is_directory: bool,
    pub(super) packed_size: u64,
    pub(super) unpacked_size: u64,
    pub(super) crc32: Option<u32>,
    pub(super) is_solid: bool,
    pub(super) data_offset: u64,
}

struct SolidRun {
    first_entry: String,
    packed: u64,
    unpacked: u64,
}

pub(super) struct Gate<'a> {
    path: &'a Path,
    limits: &'a Limits,
    members: usize,
    files: usize,
    total_unpacked: u64,
    run: Option<SolidRun>,
    entries: Vec<RarEntry>,
}

impl<'a> Gate<'a> {
    pub(super) const fn new(path: &'a Path, limits: &'a Limits) -> Self {
        Self {
            path,
            limits,
            members: 0,
            files: 0,
            total_unpacked: 0,
            run: None,
            entries: Vec::new(),
        }
    }

    pub(super) fn count_member(&mut self) -> Result<(), FormatError> {
        self.members += 1;
        if self.members > self.limits.max_entries {
            return Err(FormatError::TooManyEntries {
                path: self.path.to_owned(),
                count: self.members,
                limit: self.limits.max_entries,
            });
        }
        Ok(())
    }

    pub(super) fn accept_file(&mut self, header: FileHeader) -> Result<(), FormatError> {
        self.count_member()?;
        if header.name.chars().count() > MAX_NAME_CHARS {
            return Err(FormatError::NameTooLong {
                path: self.path.to_owned(),
                limit: MAX_NAME_CHARS,
            });
        }
        let index = self.files;
        self.files += 1;
        if header.is_directory {
            return Ok(());
        }
        self.total_unpacked = self.total_unpacked.saturating_add(header.unpacked_size);
        if self.total_unpacked > self.limits.max_total_bytes {
            return Err(FormatError::TooLargeInTotal {
                path: self.path.to_owned(),
                limit: self.limits.max_total_bytes,
            });
        }
        if is_contained_page(&header.name) && header.unpacked_size > self.limits.max_page_bytes {
            return Err(FormatError::PageTooLarge {
                path: self.path.to_owned(),
                name: header.name,
                limit: self.limits.max_page_bytes,
            });
        }
        self.extend_run(&header)?;
        self.entries.push(RarEntry {
            name: header.name,
            index,
            packed_size: header.packed_size,
            unpacked_size: header.unpacked_size,
            crc32: header.crc32,
            is_solid: header.is_solid,
            data_offset: header.data_offset,
        });
        Ok(())
    }

    pub(super) fn finish(mut self, format: RarFormat) -> Result<RarListing, FormatError> {
        self.close_run()?;
        let found = self
            .entries
            .iter()
            .enumerate()
            .filter(|(_, entry)| is_contained_page(&entry.name))
            .map(|(position, entry)| {
                let page = Page {
                    name: entry.name.clone(),
                    size: entry.unpacked_size,
                };
                (page, position)
            })
            .collect();
        let (pages, page_entries) = in_reading_order(found);
        Ok(RarListing {
            format,
            entries: self.entries,
            pages,
            page_entries,
        })
    }

    pub(super) fn encrypted(&self) -> FormatError {
        FormatError::Encrypted {
            path: self.path.to_owned(),
        }
    }

    pub(super) fn multi_volume(&self) -> FormatError {
        FormatError::MultiVolume {
            path: self.path.to_owned(),
        }
    }

    pub(super) fn unsupported(&self, method: String) -> FormatError {
        FormatError::UnsupportedCompression {
            path: self.path.to_owned(),
            method,
        }
    }

    pub(super) fn header_too_large(&self, limit: u64) -> FormatError {
        FormatError::HeaderTooLarge {
            path: self.path.to_owned(),
            limit,
        }
    }

    pub(super) fn dictionary_too_large(&self, limit: u64) -> FormatError {
        FormatError::DictionaryTooLarge {
            path: self.path.to_owned(),
            limit,
        }
    }

    pub(super) fn corrupt(&self, message: &str) -> FormatError {
        FormatError::CorruptRar {
            path: self.path.to_owned(),
            message: message.to_owned(),
        }
    }

    /// A solid entry continues the compressed stream of the entries before it, so the ratio is judged over each stream rather than each entry.
    fn extend_run(&mut self, header: &FileHeader) -> Result<(), FormatError> {
        match &mut self.run {
            Some(run) if header.is_solid => {
                run.packed = run.packed.saturating_add(header.packed_size);
                run.unpacked = run.unpacked.saturating_add(header.unpacked_size);
            }
            _ => {
                self.close_run()?;
                self.run = Some(SolidRun {
                    first_entry: header.name.clone(),
                    packed: header.packed_size,
                    unpacked: header.unpacked_size,
                });
            }
        }
        Ok(())
    }

    fn close_run(&mut self) -> Result<(), FormatError> {
        let Some(run) = self.run.take() else {
            return Ok(());
        };
        let expands_too_far = match run.unpacked.checked_div(run.packed) {
            Some(ratio) => ratio > self.limits.max_compression_ratio,
            None => run.unpacked > 0,
        };
        if expands_too_far {
            return Err(FormatError::SuspiciousCompression {
                path: self.path.to_owned(),
                name: run.first_entry,
            });
        }
        Ok(())
    }
}
