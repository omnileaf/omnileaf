use std::{
    collections::HashMap,
    fs::File,
    io::{self, Read, Seek, SeekFrom},
    ops::ControlFlow,
    path::{Path, PathBuf},
};

use flate2::Crc;
use omnileaf_libarchive::{DEFAULT_LIMIT_BYTES, Entry, EntryKind, Error, Reader};
use omnileaf_sync_proto::{Fingerprint, ImageEntry};

use crate::{
    FormatError, Limits, Page, RarEntry, RarListing,
    block_reader::BlockReader,
    entries::is_fingerprinted_image,
    error::read_failed,
    fingerprint::{fingerprint_failed, raw_fingerprint},
    limits::{COMIC_INFO_LIMIT, COMIC_INFO_NAME, read_start, read_within},
};

const ENDS_EARLY: &str = "libarchive found fewer entries than the headers list";

type Source = BlockReader<File>;

#[derive(Debug)]
pub struct RarBook {
    path: PathBuf,
    source: Source,
    listing: RarListing,
    limits: Limits,
    budget_bytes: usize,
}

impl RarBook {
    pub(crate) fn from_file(file: File, path: &Path, limits: &Limits) -> Result<Self, FormatError> {
        let (source, listing) = read_listing(file, path, limits)?;
        if listing.pages.is_empty() {
            return Err(FormatError::NoPages {
                path: path.to_owned(),
            });
        }
        Ok(Self {
            path: path.to_owned(),
            source,
            listing,
            limits: *limits,
            budget_bytes: DEFAULT_LIMIT_BYTES,
        })
    }

    pub(crate) fn pages(&self) -> &[Page] {
        &self.listing.pages
    }

    pub(crate) fn path(&self) -> &Path {
        &self.path
    }

    pub(crate) fn fingerprint(&mut self) -> Result<Fingerprint, FormatError> {
        listing_fingerprint(&self.path, &self.listing, &mut self.source)
    }

    pub(crate) fn read_comic_info(&mut self) -> Result<Option<Vec<u8>>, FormatError> {
        let Some(ordinal) = self
            .listing
            .entries
            .iter()
            .find(|entry| entry.name.eq_ignore_ascii_case(COMIC_INFO_NAME))
            .map(|entry| entry.index)
        else {
            return Ok(None);
        };
        self.read_whole_entry(ordinal, COMIC_INFO_LIMIT)?
            .map(Some)
            .ok_or_else(|| FormatError::ComicInfoTooLarge {
                path: self.path.clone(),
                limit: COMIC_INFO_LIMIT,
            })
    }

    /// Reads one page, stopping past the size limit in case the archive understates it.
    pub(crate) fn read_page(&mut self, index: usize) -> Result<Vec<u8>, FormatError> {
        let ordinal = self.ordinal_of(index)?;
        let limit = self.limits.max_page_bytes;
        self.read_whole_entry(ordinal, limit)?
            .ok_or_else(|| page_too_large(&self.path, &self.listing, &self.limits, index))
    }

    pub(crate) fn read_page_start(
        &mut self,
        index: usize,
        length: u64,
    ) -> Result<Vec<u8>, FormatError> {
        let ordinal = self.ordinal_of(index)?;
        let at_most = length.min(self.limits.max_page_bytes);
        self.read_entry(ordinal, |contents| read_start(contents, at_most))
    }

    /// A solid stream decodes only from its start, so one pass reads the pages in the order the archive stores them.
    pub(crate) fn read_every_page(
        &mut self,
        mut read: impl FnMut(usize, Vec<u8>) -> ControlFlow<()>,
    ) -> Result<(), FormatError> {
        let listing = &self.listing;
        let pages: HashMap<usize, usize> = listing
            .page_entries
            .iter()
            .enumerate()
            .filter_map(|(page, &position)| Some((listing.entries.get(position)?.index, page)))
            .collect();
        let limit = self.limits.max_page_bytes;
        let mut walk = Walk::open(&mut self.source, listing, &self.path, self.budget_bytes)?;
        let mut unread = pages.len();
        while unread > 0 {
            let entry = walk.next_file()?;
            let Some(&page) = pages.get(&entry.index) else {
                continue;
            };
            let bytes = walk
                .read_whole(entry, limit)?
                .ok_or_else(|| page_too_large(&self.path, listing, &self.limits, page))?;
            unread -= 1;
            if read(page, bytes).is_break() {
                break;
            }
        }
        Ok(())
    }

    fn read_whole_entry(
        &mut self,
        wanted: usize,
        limit: u64,
    ) -> Result<Option<Vec<u8>>, FormatError> {
        let mut walk = self.walk()?;
        let entry = walk.find(wanted)?;
        walk.read_whole(entry, limit)
    }

    fn read_entry<T>(
        &mut self,
        wanted: usize,
        read: impl FnOnce(&mut dyn Read) -> io::Result<T>,
    ) -> Result<T, FormatError> {
        let mut walk = self.walk()?;
        walk.find(wanted)?;
        walk.read(read)
    }

    fn walk(&mut self) -> Result<Walk<'_>, FormatError> {
        Walk::open(
            &mut self.source,
            &self.listing,
            &self.path,
            self.budget_bytes,
        )
    }

    fn ordinal_of(&self, index: usize) -> Result<usize, FormatError> {
        self.listing
            .page_entries
            .get(index)
            .and_then(|&position| self.listing.entries.get(position))
            .map(|entry| entry.index)
            .ok_or_else(|| FormatError::NoSuchPage {
                path: self.path.clone(),
                index,
            })
    }
}

struct Walk<'a> {
    archive: Reader<&'a mut Source>,
    listing: &'a RarListing,
    path: &'a Path,
    next_ordinal: usize,
}

impl<'a> Walk<'a> {
    fn open(
        source: &'a mut Source,
        listing: &'a RarListing,
        path: &'a Path,
        budget_bytes: usize,
    ) -> Result<Self, FormatError> {
        source.seek(SeekFrom::Start(0)).map_err(read_failed(path))?;
        let archive = Reader::open(source, budget_bytes).map_err(|error| failed(path, error))?;
        Ok(Self {
            archive,
            listing,
            path,
            next_ordinal: 0,
        })
    }

    /// A solid stream decodes only from its start, so every entry before the wanted one is decoded and dropped on the way.
    fn find(&mut self, wanted: usize) -> Result<&'a RarEntry, FormatError> {
        loop {
            let entry = self.next_file()?;
            if entry.index == wanted {
                return Ok(entry);
            }
        }
    }

    fn next_file(&mut self) -> Result<&'a RarEntry, FormatError> {
        loop {
            let entry = self
                .archive
                .next_entry()
                .map_err(|error| failed(self.path, error))?
                .ok_or_else(|| corrupt(self.path, ENDS_EARLY.to_owned()))?;
            let ordinal = self.next_ordinal;
            self.next_ordinal += 1;
            if let Some(listed) = check_entry(self.listing, ordinal, &entry)
                .map_err(|message| corrupt(self.path, message))?
            {
                return Ok(listed);
            }
        }
    }

    /// libarchive checks no stored entry's CRC-32 when its data is read to the end, so the bytes are checked against the header here.
    fn read_whole(&mut self, entry: &RarEntry, limit: u64) -> Result<Option<Vec<u8>>, FormatError> {
        let Some(bytes) = self.read(|contents| read_within(contents, limit))? else {
            return Ok(None);
        };
        let mut crc = Crc::new();
        crc.update(&bytes);
        if entry.crc32.is_some_and(|expected| expected != crc.sum()) {
            return Err(corrupt(
                self.path,
                format!("entry {} fails its CRC-32 check", entry.index),
            ));
        }
        Ok(Some(bytes))
    }

    fn read<T>(
        &mut self,
        read: impl FnOnce(&mut dyn Read) -> io::Result<T>,
    ) -> Result<T, FormatError> {
        read(&mut Contents(&mut self.archive)).map_err(|error| read_error(self.path, error))
    }
}

struct Contents<'a, 'b>(&'a mut Reader<&'b mut Source>);

impl Read for Contents<'_, '_> {
    fn read(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
        self.0.read_data(buffer).map_err(io::Error::other)
    }
}

fn check_entry<'a>(
    listing: &'a RarListing,
    ordinal: usize,
    found: &Entry,
) -> Result<Option<&'a RarEntry>, String> {
    let listed = listing
        .entries
        .binary_search_by_key(&ordinal, |entry| entry.index)
        .ok()
        .and_then(|position| listing.entries.get(position));
    match (found.kind, listed) {
        (EntryKind::Directory, None) => Ok(None),
        (EntryKind::File, Some(listed))
            if !found.is_encrypted
                && found.path == listed.name
                && found.size == Some(listed.unpacked_size) =>
        {
            Ok(Some(listed))
        }
        _ => Err(format!(
            "libarchive reads entry {ordinal} differently from its header"
        )),
    }
}

pub(crate) fn fingerprint(
    file: File,
    path: &Path,
    limits: &Limits,
) -> Result<Fingerprint, FormatError> {
    let (mut source, listing) = read_listing(file, path, limits)?;
    listing_fingerprint(path, &listing, &mut source)
}

fn read_listing(
    file: File,
    path: &Path,
    limits: &Limits,
) -> Result<(Source, RarListing), FormatError> {
    let mut source = BlockReader::new(file).map_err(read_failed(path))?;
    let listing = RarListing::read(&mut source, path, limits)?;
    Ok((source, listing))
}

/// RAR headers record each file's CRC-32 and size, so fingerprinting decodes no entry.
fn listing_fingerprint(
    path: &Path,
    listing: &RarListing,
    source: &mut Source,
) -> Result<Fingerprint, FormatError> {
    let images: Option<Vec<ImageEntry>> = listing
        .entries
        .iter()
        .filter(|entry| is_fingerprinted_image(&entry.name))
        .map(|entry| {
            Some(ImageEntry {
                crc32: entry.crc32?,
                size: entry.unpacked_size,
            })
        })
        .collect();
    match images {
        Some(images) if !images.is_empty() => {
            Fingerprint::pmf1(images).map_err(|source| fingerprint_failed(path, source))
        }
        Some(_) | None => raw_fingerprint(path, source),
    }
}

fn page_too_large(path: &Path, listing: &RarListing, limits: &Limits, index: usize) -> FormatError {
    FormatError::PageTooLarge {
        path: path.to_owned(),
        name: listing
            .pages
            .get(index)
            .map(|page| page.name.clone())
            .unwrap_or_default(),
        limit: limits.max_page_bytes,
    }
}

fn read_error(path: &Path, error: io::Error) -> FormatError {
    match error.downcast::<Error>() {
        Ok(error) => failed(path, error),
        Err(source) => FormatError::Read {
            path: path.to_owned(),
            source,
        },
    }
}

fn failed(path: &Path, error: Error) -> FormatError {
    match error {
        Error::BudgetExceeded { limit_bytes } => FormatError::DecoderOutOfMemory {
            path: path.to_owned(),
            limit: u64::try_from(limit_bytes).unwrap_or(u64::MAX),
        },
        Error::Source(source) => FormatError::Read {
            path: path.to_owned(),
            source,
        },
        other => corrupt(path, other.to_string()),
    }
}

fn corrupt(path: &Path, message: String) -> FormatError {
    FormatError::CorruptRar {
        path: path.to_owned(),
        message,
    }
}

#[cfg(test)]
mod tests {
    use omnileaf_testkit::{ArchiveEntry, RarFormat as Format, RarOptions, ScratchFolder, cbr};

    use super::*;
    use crate::RarFormat;

    const SMALL_BUDGET_BYTES: usize = 4 * 1024;

    fn listed(name: &str, index: usize, unpacked_size: u64) -> RarEntry {
        RarEntry {
            name: name.to_owned(),
            index,
            packed_size: unpacked_size,
            unpacked_size,
            crc32: None,
            is_solid: false,
            data_offset: 0,
        }
    }

    fn listing() -> RarListing {
        RarListing {
            format: RarFormat::Rar5,
            entries: vec![listed("chapter/1.png", 1, 8)],
            pages: Vec::new(),
            page_entries: Vec::new(),
        }
    }

    fn found(path: &str, size: Option<u64>, kind: EntryKind) -> Entry {
        Entry {
            path: path.to_owned(),
            size,
            kind,
            is_encrypted: false,
        }
    }

    #[test]
    fn accepts_the_entries_the_headers_list_in_their_place() {
        let listing = listing();

        let folder = check_entry(&listing, 0, &found("chapter", None, EntryKind::Directory));
        let file = check_entry(
            &listing,
            1,
            &found("chapter/1.png", Some(8), EntryKind::File),
        );

        assert_eq!(folder, Ok(None));
        assert_eq!(file, Ok(listing.entries.first()));
    }

    #[test]
    fn refuses_an_entry_read_differently_from_its_header() {
        let listing = listing();
        let mismatches = [
            (0, found("chapter/1.png", Some(8), EntryKind::File)),
            (1, found("chapter/2.png", Some(8), EntryKind::File)),
            (1, found("chapter/1.png", Some(9), EntryKind::File)),
            (1, found("chapter/1.png", None, EntryKind::File)),
            (1, found("chapter/1.png", Some(8), EntryKind::Directory)),
            (1, found("chapter/1.png", Some(8), EntryKind::Other)),
            (
                1,
                Entry {
                    is_encrypted: true,
                    ..found("chapter/1.png", Some(8), EntryKind::File)
                },
            ),
            (2, found("chapter/3.png", Some(8), EntryKind::File)),
        ];

        let refused = mismatches
            .iter()
            .filter(|(ordinal, entry)| check_entry(&listing, *ordinal, entry).is_err())
            .count();

        assert_eq!(refused, mismatches.len());
    }

    #[test]
    fn refuses_a_page_libarchive_cannot_read_within_its_memory_budget() {
        let scratch = ScratchFolder::new("rar-budget");
        let entries = [ArchiveEntry {
            name: "1.png".to_owned(),
            bytes: b"page".to_vec(),
        }];
        let archive = cbr(&entries, &RarOptions::of(Format::RAR5)).unwrap_or_default();
        let path = scratch.write("book.cbr", &archive);
        let file = File::open(&path).unwrap_or_else(|error| panic!("{error}"));
        let mut book = RarBook::from_file(file, &path, &Limits::default())
            .unwrap_or_else(|error| panic!("{error}"));
        book.budget_bytes = SMALL_BUDGET_BYTES;

        let error = book.read_page(0);

        assert!(
            matches!(error, Err(FormatError::DecoderOutOfMemory { limit, .. }) if limit == SMALL_BUDGET_BYTES as u64),
            "{error:?}"
        );
    }
}
