use std::{
    io,
    path::{Path, PathBuf},
    sync::Arc,
};

use omnileaf_sync_proto::Fingerprint;

use crate::{
    Entry, EntryKind, FormatError, Limits, Page, Storage,
    book::in_reading_order,
    error::read_failed,
    fingerprint::folder_fingerprint,
    is_ignored, is_page_image,
    limits::{COMIC_INFO_LIMIT, COMIC_INFO_NAME, read_within},
};

/// A folder whose images, directly inside it, are one book's pages.
#[derive(Debug)]
pub struct FolderBook {
    storage: Arc<dyn Storage>,
    path: PathBuf,
    entries: Vec<Entry>,
    pages: Vec<Page>,
    files: Vec<PathBuf>,
    limits: Limits,
}

impl FolderBook {
    pub(crate) fn open(
        storage: Arc<dyn Storage>,
        path: &Path,
        limits: &Limits,
    ) -> Result<Self, FormatError> {
        let entries = read_folder(&*storage, path, limits)?;
        let mut found = Vec::new();
        let mut total: u64 = 0;
        for entry in &entries {
            let EntryKind::File { size } = entry.kind else {
                continue;
            };
            let name = entry.name.to_string_lossy().into_owned();
            if is_ignored(&name) || !is_page_image(&name) {
                continue;
            }
            if size > limits.max_page_bytes {
                return Err(FormatError::PageTooLarge {
                    path: path.to_owned(),
                    name,
                    limit: limits.max_page_bytes,
                });
            }
            total = total.saturating_add(size);
            if total > limits.max_total_bytes {
                return Err(FormatError::TooLargeInTotal {
                    path: path.to_owned(),
                    limit: limits.max_total_bytes,
                });
            }
            found.push((Page { name, size }, path.join(&entry.name)));
        }
        if found.is_empty() {
            return Err(FormatError::NoPages {
                path: path.to_owned(),
            });
        }
        let (pages, files) = in_reading_order(found);
        Ok(Self {
            storage,
            path: path.to_owned(),
            entries,
            pages,
            files,
            limits: *limits,
        })
    }

    pub(crate) fn pages(&self) -> &[Page] {
        &self.pages
    }

    pub(crate) fn path(&self) -> &Path {
        &self.path
    }

    pub(crate) fn fingerprint(&self) -> Result<Fingerprint, FormatError> {
        folder_fingerprint(&*self.storage, &self.path, &self.entries)
    }

    pub(crate) fn read_comic_info(&self) -> Result<Option<Vec<u8>>, FormatError> {
        let Some(entry) = self.entries.iter().find(|entry| is_comic_info(entry)) else {
            return Ok(None);
        };
        read_file_within(
            &*self.storage,
            &self.path.join(&entry.name),
            COMIC_INFO_LIMIT,
        )
        .map_err(read_failed(&self.path))?
        .map(Some)
        .ok_or_else(|| FormatError::ComicInfoTooLarge {
            path: self.path.clone(),
            limit: COMIC_INFO_LIMIT,
        })
    }

    pub(crate) fn read_page(&self, index: usize) -> Result<Vec<u8>, FormatError> {
        let (Some(file), Some(page)) = (self.files.get(index), self.pages.get(index)) else {
            return Err(FormatError::NoSuchPage {
                path: self.path.clone(),
                index,
            });
        };
        let limit = self.limits.max_page_bytes;
        read_file_within(&*self.storage, file, limit)
            .map_err(read_failed(file))?
            .ok_or_else(|| FormatError::PageTooLarge {
                path: self.path.clone(),
                name: page.name.clone(),
                limit,
            })
    }
}

/// Lists what is directly inside the folder, refusing more entries than the limits allow or any entry it can't read.
pub(crate) fn read_folder(
    storage: &dyn Storage,
    path: &Path,
    limits: &Limits,
) -> Result<Vec<Entry>, FormatError> {
    let entries = storage.entries(path).map_err(read_failed(path))?;
    if entries.len() > limits.max_entries {
        return Err(FormatError::TooManyEntries {
            path: path.to_owned(),
            count: entries.len(),
            limit: limits.max_entries,
        });
    }
    if let Some((name, failure)) = entries.iter().find_map(unreadable) {
        return Err(read_failed(&path.join(name))(failure.into()));
    }
    Ok(entries)
}

fn unreadable(entry: &Entry) -> Option<(&Path, io::ErrorKind)> {
    match entry.kind {
        EntryKind::Unreadable(failure) => Some((Path::new(&entry.name), failure)),
        EntryKind::Folder | EntryKind::File { .. } | EntryKind::Other => None,
    }
}

fn is_comic_info(entry: &Entry) -> bool {
    matches!(entry.kind, EntryKind::File { .. })
        && entry
            .name
            .to_string_lossy()
            .eq_ignore_ascii_case(COMIC_INFO_NAME)
}

/// Refuses a file larger than `limit` by its size before reading it, and again while reading in case it grows.
fn read_file_within(storage: &dyn Storage, file: &Path, limit: u64) -> io::Result<Option<Vec<u8>>> {
    let opened = storage.open(file)?;
    if opened.metadata()?.len() > limit {
        return Ok(None);
    }
    read_within(opened, limit)
}
