use std::{
    collections::HashMap,
    fmt,
    fs::File,
    io::{self, Read},
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
const MIB: u64 = 1024 * 1024;
/// A solid RAR decodes every entry it skips, so this bounds the work one read of a page may cost.
const MAX_SOLID_SKIP_BYTES: u64 = 1024 * MIB;

type Source = BlockReader<File>;

#[derive(Debug)]
pub struct RarBook {
    path: PathBuf,
    file: File,
    source: Source,
    listing: RarListing,
    limits: Limits,
    budget_bytes: usize,
    skip_limit_bytes: u64,
    cursor: Option<Cursor>,
    #[cfg(test)]
    opens: usize,
}

struct Cursor {
    archive: Reader<Source>,
    next_ordinal: usize,
}

impl fmt::Debug for Cursor {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("Cursor")
            .field("next_ordinal", &self.next_ordinal)
            .finish_non_exhaustive()
    }
}

impl RarBook {
    pub(crate) fn from_file(file: File, path: &Path, limits: &Limits) -> Result<Self, FormatError> {
        let cloned = file.try_clone().map_err(read_failed(path))?;
        let (source, listing) = read_listing(cloned, path, limits)?;
        if listing.pages.is_empty() {
            return Err(FormatError::NoPages {
                path: path.to_owned(),
            });
        }
        Ok(Self {
            path: path.to_owned(),
            file,
            source,
            listing,
            limits: *limits,
            budget_bytes: DEFAULT_LIMIT_BYTES,
            skip_limit_bytes: MAX_SOLID_SKIP_BYTES,
            cursor: None,
            #[cfg(test)]
            opens: 0,
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
            .rfind(|entry| entry.name.eq_ignore_ascii_case(COMIC_INFO_NAME))
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
        let entry = self.page_entry(index)?;
        let (ordinal, at_most) = (
            entry.index,
            length
                .min(self.limits.max_page_bytes)
                .min(entry.unpacked_size),
        );
        let start = self.read_entry(ordinal, |contents| read_start(contents, at_most))?;
        if (start.len() as u64) < at_most {
            return Err(corrupt(&self.path, different_from_header(ordinal)));
        }
        Ok(start)
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
        let (limits, path) = (self.limits, self.path.clone());
        self.with_walk(0, |walk| {
            let mut unread = pages.len();
            while unread > 0 {
                let entry = walk.next_file()?;
                let Some(&page) = pages.get(&entry.index) else {
                    continue;
                };
                let bytes = walk
                    .read_whole(entry, limits.max_page_bytes)?
                    .ok_or_else(|| page_too_large(&path, walk.listing, &limits, page))?;
                unread -= 1;
                if read(page, bytes).is_break() {
                    break;
                }
            }
            Ok(())
        })
    }

    fn read_whole_entry(
        &mut self,
        wanted: usize,
        limit: u64,
    ) -> Result<Option<Vec<u8>>, FormatError> {
        self.with_walk(wanted, |walk| {
            let entry = walk.find(wanted)?;
            walk.read_whole(entry, limit)
        })
    }

    fn read_entry<T>(
        &mut self,
        wanted: usize,
        read: impl FnOnce(&mut dyn Read) -> io::Result<T>,
    ) -> Result<T, FormatError> {
        self.with_walk(wanted, |walk| {
            walk.find(wanted)?;
            walk.read(read)
        })
    }

    /// libarchive reads an archive only forwards, so the reader is kept between reads and opened again only to go back.
    fn with_walk<T>(
        &mut self,
        from: usize,
        step: impl FnOnce(&mut Walk<'_>) -> Result<T, FormatError>,
    ) -> Result<T, FormatError> {
        let outcome = self.walk(from).and_then(|mut walk| step(&mut walk));
        if outcome.is_err() {
            self.cursor = None;
        }
        outcome
    }

    fn walk(&mut self, from: usize) -> Result<Walk<'_>, FormatError> {
        let cursor = match self.cursor.take() {
            Some(cursor) if cursor.next_ordinal <= from => cursor,
            _ => self.open_cursor()?,
        };
        let is_solid = self.listing.entries.iter().any(|entry| entry.is_solid);
        let cursor = self.cursor.insert(cursor);
        Ok(Walk {
            cursor,
            listing: &self.listing,
            path: &self.path,
            skipped_bytes: 0,
            skip_limit_bytes: if is_solid {
                self.skip_limit_bytes
            } else {
                u64::MAX
            },
        })
    }

    fn open_cursor(&mut self) -> Result<Cursor, FormatError> {
        let file = self.file.try_clone().map_err(read_failed(&self.path))?;
        let source = BlockReader::new(file).map_err(read_failed(&self.path))?;
        let archive =
            Reader::open(source, self.budget_bytes).map_err(|error| failed(&self.path, error))?;
        #[cfg(test)]
        {
            self.opens += 1;
        }
        Ok(Cursor {
            archive,
            next_ordinal: 0,
        })
    }

    fn ordinal_of(&self, index: usize) -> Result<usize, FormatError> {
        self.page_entry(index).map(|entry| entry.index)
    }

    fn page_entry(&self, index: usize) -> Result<&RarEntry, FormatError> {
        self.listing
            .page_entries
            .get(index)
            .and_then(|&position| self.listing.entries.get(position))
            .ok_or_else(|| FormatError::NoSuchPage {
                path: self.path.clone(),
                index,
            })
    }
}

struct Walk<'a> {
    cursor: &'a mut Cursor,
    listing: &'a RarListing,
    path: &'a Path,
    skipped_bytes: u64,
    skip_limit_bytes: u64,
}

impl<'a> Walk<'a> {
    /// A solid stream decodes only from its start, so every entry before the wanted one is decoded and dropped on the way.
    fn find(&mut self, wanted: usize) -> Result<&'a RarEntry, FormatError> {
        loop {
            let entry = self.next_file()?;
            if entry.index == wanted {
                return Ok(entry);
            }
            self.skipped_bytes = self.skipped_bytes.saturating_add(entry.unpacked_size);
            if self.skipped_bytes > self.skip_limit_bytes {
                return Err(FormatError::TooMuchToSkip {
                    path: self.path.to_owned(),
                    limit: self.skip_limit_bytes,
                });
            }
        }
    }

    fn next_file(&mut self) -> Result<&'a RarEntry, FormatError> {
        loop {
            let entry = self
                .cursor
                .archive
                .next_entry()
                .map_err(|error| failed(self.path, error))?
                .ok_or_else(|| corrupt(self.path, ENDS_EARLY.to_owned()))?;
            let ordinal = self.cursor.next_ordinal;
            self.cursor.next_ordinal += 1;
            if let Some(listed) = check_entry(self.listing, ordinal, &entry)
                .map_err(|message| corrupt(self.path, message))?
            {
                return Ok(listed);
            }
        }
    }

    /// libarchive checks neither a stored entry's length nor its CRC-32, and verifies no other hash a RAR5 entry may carry instead, so the bytes are checked against the header here.
    fn read_whole(&mut self, entry: &RarEntry, limit: u64) -> Result<Option<Vec<u8>>, FormatError> {
        if entry.unpacked_size > limit {
            return Ok(None);
        }
        let Some(expected_crc32) = entry.crc32 else {
            return Err(corrupt(
                self.path,
                format!("entry {} has no CRC-32 to check", entry.index),
            ));
        };
        let bytes = self.read(|contents| read_within(contents, entry.unpacked_size))?;
        match bytes {
            Some(bytes)
                if bytes.len() as u64 == entry.unpacked_size && crc32(&bytes) == expected_crc32 =>
            {
                Ok(Some(bytes))
            }
            _ => Err(corrupt(self.path, different_from_header(entry.index))),
        }
    }

    fn read<T>(
        &mut self,
        read: impl FnOnce(&mut dyn Read) -> io::Result<T>,
    ) -> Result<T, FormatError> {
        read(&mut Contents(&mut self.cursor.archive)).map_err(|error| read_error(self.path, error))
    }
}

struct Contents<'a>(&'a mut Reader<Source>);

impl Read for Contents<'_> {
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
        Error::Unavailable => FormatError::DecoderUnavailable {
            path: path.to_owned(),
        },
        Error::Source(source) => FormatError::Read {
            path: path.to_owned(),
            source,
        },
        other => corrupt(path, other.to_string()),
    }
}

fn crc32(bytes: &[u8]) -> u32 {
    let mut crc = Crc::new();
    crc.update(bytes);
    crc.sum()
}

fn different_from_header(ordinal: usize) -> String {
    format!("entry {ordinal} holds bytes that differ from its header's size or CRC-32")
}

fn corrupt(path: &Path, message: String) -> FormatError {
    FormatError::CorruptRar {
        path: path.to_owned(),
        message,
    }
}

#[cfg(test)]
mod tests {
    use omnileaf_testkit::{
        ArchiveEntry, Packing, RarFormat as Format, RarOptions, ScratchFolder, cbr,
    };

    use super::*;
    use crate::RarFormat;

    const SMALL_BUDGET_BYTES: usize = 4 * 1024;
    const SMALL_SKIP_LIMIT_BYTES: u64 = 16;
    const PAGE_REPEATS: usize = 20;
    const START_LENGTH: u64 = 4;
    const THREE_PAGES: [&str; 3] = ["1.png", "2.png", "3.png"];

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

    fn book(scratch: &ScratchFolder, names: &[&str], options: &RarOptions) -> RarBook {
        let entries: Vec<ArchiveEntry> = names
            .iter()
            .map(|name| ArchiveEntry {
                name: (*name).to_owned(),
                bytes: name.as_bytes().repeat(PAGE_REPEATS),
            })
            .collect();
        let archive = cbr(&entries, options).unwrap_or_default();
        let path = scratch.write("book.cbr", &archive);
        let file = File::open(&path).unwrap_or_else(|error| panic!("{error}"));
        RarBook::from_file(file, &path, &Limits::default())
            .unwrap_or_else(|error| panic!("{error}"))
    }

    #[test]
    fn refuses_a_page_libarchive_cannot_read_within_its_memory_budget() {
        let scratch = ScratchFolder::new("rar-budget");
        let mut book = book(&scratch, &["1.png"], &RarOptions::of(Format::RAR5));
        book.budget_bytes = SMALL_BUDGET_BYTES;

        let error = book.read_page(0);

        assert!(
            matches!(error, Err(FormatError::DecoderOutOfMemory { limit, .. }) if limit == SMALL_BUDGET_BYTES as u64),
            "{error:?}"
        );
    }

    #[test]
    fn reports_a_decoder_that_could_not_start_apart_from_a_damaged_archive() {
        let error = failed(Path::new("book.cbr"), Error::Unavailable);

        assert!(
            matches!(error, FormatError::DecoderUnavailable { .. }),
            "{error:?}"
        );
    }

    #[test]
    fn reads_pages_in_archive_order_through_one_reader() {
        let scratch = ScratchFolder::new("rar-one-reader");
        for format in [Format::RAR4, Format::RAR5] {
            let mut book = book(&scratch, &THREE_PAGES, &RarOptions::of(format));

            let starts: Vec<_> = (0..THREE_PAGES.len())
                .map(|index| book.read_page_start(index, START_LENGTH).is_ok())
                .collect();
            let last = book.read_page(2);

            assert_eq!(starts, [true; 3], "{format:?}");
            assert!(last.is_ok(), "{format:?}: {last:?}");
            assert_eq!(book.opens, 2, "{format:?}");
        }
    }

    #[test]
    fn reopens_the_archive_to_read_a_page_stored_earlier() {
        let scratch = ScratchFolder::new("rar-reopen");
        for format in [Format::RAR4, Format::RAR5] {
            let mut book = book(&scratch, &THREE_PAGES, &RarOptions::of(format));

            let later = book.read_page(2);
            let earlier = book.read_page(0);

            assert_eq!(
                (later.ok(), earlier.ok(), book.opens),
                (
                    Some(page_bytes(THREE_PAGES[2])),
                    Some(page_bytes(THREE_PAGES[0])),
                    2
                ),
                "{format:?}"
            );
        }
    }

    #[test]
    fn refuses_to_decode_more_than_the_skip_limit_to_reach_a_solid_page() {
        let scratch = ScratchFolder::new("rar-skip-limit");
        let solid = RarOptions {
            packing: Packing::Solid,
            ..RarOptions::of(Format::RAR5)
        };
        let mut book = book(&scratch, &THREE_PAGES, &solid);
        book.skip_limit_bytes = SMALL_SKIP_LIMIT_BYTES;

        let error = book.read_page(2);

        assert!(
            matches!(error, Err(FormatError::TooMuchToSkip { limit, .. }) if limit == SMALL_SKIP_LIMIT_BYTES),
            "{error:?}"
        );
    }

    #[test]
    fn skips_past_the_skip_limit_in_an_archive_that_is_not_solid() {
        let scratch = ScratchFolder::new("rar-skip-limit-not-solid");
        let mut book = book(&scratch, &THREE_PAGES, &RarOptions::of(Format::RAR5));
        book.skip_limit_bytes = SMALL_SKIP_LIMIT_BYTES;

        let page = book.read_page(2);

        assert_eq!(page.ok(), Some(page_bytes(THREE_PAGES[2])));
    }

    fn page_bytes(name: &str) -> Vec<u8> {
        name.as_bytes().repeat(PAGE_REPEATS)
    }
}
