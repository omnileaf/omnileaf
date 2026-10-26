use std::{
    fs::File,
    io::{self, Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    sync::Arc,
};

use omnileaf_sync_proto::{Fingerprint, ImageEntry};
use zip::{read::read_zipfile_from_stream, result::ZipError};

use crate::{
    FormatError, Limits, Page,
    block_reader::BlockReader,
    book::in_reading_order,
    entries::is_fingerprinted_image,
    error::read_failed,
    fingerprint::{fingerprint_failed, raw_fingerprint},
    is_ignored, is_page_image,
    limits::{COMIC_INFO_LIMIT, COMIC_INFO_NAME, read_start, read_within},
    zip_book::{check_page, corrupt},
};

/// The ZIP spec's local file header holds a four-byte signature and 22 bytes of fields, then the name's and the extra field's lengths.
const LOCAL_HEADER_SIGNATURE: [u8; 4] = *b"PK\x03\x04";
const LOCAL_HEADER_LENGTH: usize = 30;

#[derive(Debug)]
pub struct SalvagedZipBook {
    path: PathBuf,
    file: Arc<File>,
    reader: BlockReader<Arc<File>>,
    pages: Vec<Page>,
    headers: Vec<u64>,
    comic_info: Option<u64>,
    images: Vec<ImageEntry>,
    limits: Limits,
}

struct Survivor {
    header: u64,
    end: u64,
    name: String,
    is_dir: bool,
    size: u64,
    compressed_size: u64,
    crc32: u32,
}

impl SalvagedZipBook {
    pub(crate) fn salvaged_from(
        file: File,
        path: &Path,
        limits: &Limits,
    ) -> Result<Option<Self>, FormatError> {
        let file = Arc::new(file);
        let mut reader = BlockReader::new(Arc::clone(&file)).map_err(read_failed(path))?;
        let survivors = survivors(&mut reader, path, limits)?;
        let mut found = Vec::new();
        let mut total: u64 = 0;
        for survivor in &survivors {
            if survivor.is_dir || is_ignored(&survivor.name) || !is_page_image(&survivor.name) {
                continue;
            }
            let page = Page {
                name: survivor.name.clone(),
                size: survivor.size,
            };
            check_page(path, &page, survivor.compressed_size, limits)?;
            total = total.saturating_add(page.size);
            if total > limits.max_total_bytes {
                return Err(FormatError::TooLargeInTotal {
                    path: path.to_owned(),
                    limit: limits.max_total_bytes,
                });
            }
            found.push((page, survivor.header));
        }
        if found.is_empty() {
            return Ok(None);
        }
        let (pages, headers) = in_reading_order(found);
        Ok(Some(Self {
            path: path.to_owned(),
            file,
            reader,
            pages,
            headers,
            comic_info: survivors
                .iter()
                .find(|survivor| survivor.name.eq_ignore_ascii_case(COMIC_INFO_NAME))
                .map(|survivor| survivor.header),
            images: survivors
                .iter()
                .filter(|survivor| !survivor.is_dir && is_fingerprinted_image(&survivor.name))
                .map(|survivor| ImageEntry {
                    crc32: survivor.crc32,
                    size: survivor.size,
                })
                .collect(),
            limits: *limits,
        }))
    }

    pub(crate) fn pages(&self) -> &[Page] {
        &self.pages
    }

    pub(crate) fn path(&self) -> &Path {
        &self.path
    }

    pub(crate) fn fingerprint(&mut self) -> Result<Fingerprint, FormatError> {
        if self.images.is_empty() {
            return raw_fingerprint(&self.path, &*self.file);
        }
        Fingerprint::pmf1(self.images.clone())
            .map_err(|source| fingerprint_failed(&self.path, source))
    }

    pub(crate) fn read_comic_info(&mut self) -> Result<Option<Vec<u8>>, FormatError> {
        let Some(header) = self.comic_info else {
            return Ok(None);
        };
        self.read_entry(header, |entry| read_within(entry, COMIC_INFO_LIMIT))?
            .map(Some)
            .ok_or_else(|| FormatError::ComicInfoTooLarge {
                path: self.path.clone(),
                limit: COMIC_INFO_LIMIT,
            })
    }

    pub(crate) fn read_page(&mut self, index: usize) -> Result<Vec<u8>, FormatError> {
        let limit = self.limits.max_page_bytes;
        let (header, name) = self.page_entry(index)?;
        self.read_entry(header, |entry| read_within(entry, limit))?
            .ok_or_else(|| FormatError::PageTooLarge {
                path: self.path.clone(),
                name,
                limit,
            })
    }

    pub(crate) fn read_page_start(
        &mut self,
        index: usize,
        length: u64,
    ) -> Result<Vec<u8>, FormatError> {
        let at_most = length.min(self.limits.max_page_bytes);
        let (header, _) = self.page_entry(index)?;
        self.read_entry(header, |entry| read_start(entry, at_most))
    }

    fn page_entry(&self, index: usize) -> Result<(u64, String), FormatError> {
        let (Some(&header), Some(page)) = (self.headers.get(index), self.pages.get(index)) else {
            return Err(FormatError::NoSuchPage {
                path: self.path.clone(),
                index,
            });
        };
        Ok((header, page.name.clone()))
    }

    fn read_entry<T>(
        &mut self,
        header: u64,
        read: impl FnOnce(&mut dyn Read) -> io::Result<T>,
    ) -> Result<T, FormatError> {
        self.reader
            .seek(SeekFrom::Start(header))
            .map_err(read_failed(&self.path))?;
        let mut entry = read_zipfile_from_stream(&mut self.reader)
            .map_err(|source| corrupt(&self.path, source))?
            .ok_or_else(|| corrupt(&self.path, ZipError::FileNotFound))?;
        read(&mut entry).map_err(|source| corrupt(&self.path, ZipError::Io(source)))
    }
}

fn survivors(
    reader: &mut BlockReader<Arc<File>>,
    path: &Path,
    limits: &Limits,
) -> Result<Vec<Survivor>, FormatError> {
    let length = reader.seek(SeekFrom::End(0)).map_err(read_failed(path))?;
    let mut survivors = Vec::new();
    let mut header = 0;
    while let Some(survivor) = survivor_at(reader, header, length) {
        header = survivor.end;
        survivors.push(survivor);
        if survivors.len() > limits.max_entries {
            return Err(FormatError::TooManyEntries {
                path: path.to_owned(),
                count: survivors.len(),
                limit: limits.max_entries,
            });
        }
    }
    Ok(survivors)
}

fn survivor_at(reader: &mut BlockReader<Arc<File>>, header: u64, length: u64) -> Option<Survivor> {
    reader.seek(SeekFrom::Start(header)).ok()?;
    let mut fixed = [0; LOCAL_HEADER_LENGTH];
    reader.read_exact(&mut fixed).ok()?;
    let [s0, s1, s2, s3, .., n0, n1, e0, e1] = fixed;
    if [s0, s1, s2, s3] != LOCAL_HEADER_SIGNATURE {
        return None;
    }
    let header_length = u64::try_from(LOCAL_HEADER_LENGTH).ok()?
        + u64::from(u16::from_le_bytes([n0, n1]))
        + u64::from(u16::from_le_bytes([e0, e1]));
    reader.seek(SeekFrom::Start(header)).ok()?;
    let mut header_only = (&mut *reader).take(header_length);
    let entry = read_zipfile_from_stream(&mut header_only).ok()??;
    let end = header
        .checked_add(header_length)?
        .checked_add(entry.compressed_size())?;
    if end > length {
        return None;
    }
    Some(Survivor {
        header,
        end,
        name: entry.name().ok()?.into_owned(),
        is_dir: entry.is_dir(),
        size: entry.size(),
        compressed_size: entry.compressed_size(),
        crc32: entry.crc32(),
    })
}
