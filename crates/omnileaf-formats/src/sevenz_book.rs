use std::{
    collections::{BTreeMap, HashMap},
    fs::File,
    io::{self, Read},
    ops::{ControlFlow, Range},
    path::{Path, PathBuf},
    ptr,
};

use omnileaf_sync_proto::{Fingerprint, ImageEntry};
use sevenz_rust2::{Archive, ArchiveEntry, BlockDecoder, Coder, EncoderMethod, Password};

use crate::{
    FormatError, Limits, Page,
    block_reader::BlockReader,
    book::in_reading_order,
    entries::is_fingerprinted_image,
    error::read_failed,
    fingerprint::{fingerprint_failed, raw_fingerprint},
    is_ignored, is_page_image,
    limits::{COMIC_INFO_LIMIT, COMIC_INFO_NAME, read_start, read_within},
    sevenz_header::check_header,
};

const MIB: u64 = 1024 * 1024;
const SINGLE_THREAD: u32 = 1;
const PARENT_FOLDER: &str = "..";
const SEPARATORS: [char; 2] = ['/', '\\'];
const LZMA_DICTIONARY: Range<usize> = 1..5;
const LZMA2_LARGEST_DICTIONARY_CODE: u8 = 40;
const LZMA2_DICTIONARY_SHIFT: u8 = 11;
const DECODABLE_METHODS: [&[u8]; 13] = [
    EncoderMethod::ID_COPY,
    EncoderMethod::ID_LZMA,
    EncoderMethod::ID_LZMA2,
    EncoderMethod::ID_DELTA,
    EncoderMethod::ID_BCJ_X86,
    EncoderMethod::ID_BCJ2,
    EncoderMethod::ID_BCJ_PPC,
    EncoderMethod::ID_BCJ_IA64,
    EncoderMethod::ID_BCJ_ARM,
    EncoderMethod::ID_BCJ_ARM64,
    EncoderMethod::ID_BCJ_ARM_THUMB,
    EncoderMethod::ID_BCJ_SPARC,
    EncoderMethod::ID_BCJ_RISCV,
];

/// The decoder allocates the whole dictionary an archive declares before reading a byte, so a tiny hostile archive could otherwise claim gigabytes.
pub(crate) const MAX_DICTIONARY_BYTES: u64 = 256 * MIB;

type Source = BlockReader<File>;

#[derive(Debug)]
pub struct SevenZipBook {
    path: PathBuf,
    source: Source,
    archive: Box<Archive>,
    pages: Vec<Page>,
    entries: Vec<usize>,
    limits: Limits,
}

impl SevenZipBook {
    pub(crate) fn from_file(file: File, path: &Path, limits: &Limits) -> Result<Self, FormatError> {
        let (source, archive) = read_archive(file, path, limits)?;
        for block in 0..archive.blocks.len() {
            check_block(path, &archive, block, limits)?;
        }
        let mut found = Vec::new();
        let mut total: u64 = 0;
        for (index, entry) in archive.files.iter().enumerate() {
            total = total.saturating_add(entry.size);
            if total > limits.max_total_bytes {
                return Err(FormatError::TooLargeInTotal {
                    path: path.to_owned(),
                    limit: limits.max_total_bytes,
                });
            }
            if !is_page(entry) {
                continue;
            }
            if entry.size > limits.max_page_bytes {
                return Err(FormatError::PageTooLarge {
                    path: path.to_owned(),
                    name: entry.name.clone(),
                    limit: limits.max_page_bytes,
                });
            }
            let page = Page {
                name: entry.name.clone(),
                size: entry.size,
            };
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
            source,
            archive: Box::new(archive),
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
        archive_fingerprint(&self.path, &self.archive, &mut self.source)
    }

    pub(crate) fn read_comic_info(&mut self) -> Result<Option<Vec<u8>>, FormatError> {
        let Some(file) = self.archive.files.iter().position(|entry| {
            !entry.is_directory && entry.name.eq_ignore_ascii_case(COMIC_INFO_NAME)
        }) else {
            return Ok(None);
        };
        self.read_entry(file, |contents| read_within(contents, COMIC_INFO_LIMIT))?
            .map(Some)
            .ok_or_else(|| FormatError::ComicInfoTooLarge {
                path: self.path.clone(),
                limit: COMIC_INFO_LIMIT,
            })
    }

    /// Reads one page, stopping past the size limit in case the archive understates it.
    pub(crate) fn read_page(&mut self, index: usize) -> Result<Vec<u8>, FormatError> {
        let Some(&file) = self.entries.get(index) else {
            return Err(FormatError::NoSuchPage {
                path: self.path.clone(),
                index,
            });
        };
        let limit = self.limits.max_page_bytes;
        self.read_entry(file, |contents| read_within(contents, limit))?
            .ok_or_else(|| self.page_too_large(index))
    }

    /// A solid block decodes only from its start, so each block's pages are read in one pass in the order it stores them.
    pub(crate) fn read_every_page(
        &mut self,
        mut read: impl FnMut(usize, Vec<u8>) -> ControlFlow<()>,
    ) -> Result<(), FormatError> {
        let mut blocks: BTreeMap<usize, HashMap<*const ArchiveEntry, usize>> = BTreeMap::new();
        for (page, &file) in self.entries.iter().enumerate() {
            match (self.block_of(file), self.archive.files.get(file)) {
                (Some(block), Some(entry)) => {
                    blocks
                        .entry(block)
                        .or_default()
                        .insert(ptr::from_ref(entry), page);
                }
                _ => {
                    if read(page, Vec::new()).is_break() {
                        return Ok(());
                    }
                }
            }
        }
        for (&block, pages) in &blocks {
            if self.read_block_pages(block, pages, &mut read)?.is_break() {
                return Ok(());
            }
        }
        Ok(())
    }

    pub(crate) fn read_page_start(
        &mut self,
        index: usize,
        length: u64,
    ) -> Result<Vec<u8>, FormatError> {
        let Some(&file) = self.entries.get(index) else {
            return Err(FormatError::NoSuchPage {
                path: self.path.clone(),
                index,
            });
        };
        let at_most = length.min(self.limits.max_page_bytes);
        self.read_entry(file, |contents| read_start(contents, at_most))
    }

    /// Hands `read` one entry's contents; a solid block decodes only from its start, so the entries before it are decoded and dropped on the way.
    fn read_entry<T>(
        &mut self,
        file: usize,
        read: impl FnOnce(&mut dyn Read) -> io::Result<T>,
    ) -> Result<T, FormatError> {
        let (Some(block), Some(wanted)) = (self.block_of(file), self.archive.files.get(file))
        else {
            return read(&mut io::empty()).map_err(|source| corrupt(&self.path, source.into()));
        };
        let mut read = Some(read);
        let mut outcome = None;
        let password = Password::empty();
        BlockDecoder::new(
            SINGLE_THREAD,
            block,
            &self.archive,
            &password,
            &mut self.source,
        )
        .for_each_entries(&mut |entry, contents| {
            if !std::ptr::eq(entry, wanted) {
                io::copy(contents, &mut io::sink())?;
                return Ok(true);
            }
            outcome = read.take().map(|read| read(contents));
            Ok(false)
        })
        .map_err(|source| corrupt(&self.path, source))?;
        outcome
            .ok_or(sevenz_rust2::Error::FileNotFound)
            .and_then(|read| read.map_err(sevenz_rust2::Error::from))
            .map_err(|source| corrupt(&self.path, source))
    }

    fn read_block_pages(
        &mut self,
        block: usize,
        pages: &HashMap<*const ArchiveEntry, usize>,
        read: &mut impl FnMut(usize, Vec<u8>) -> ControlFlow<()>,
    ) -> Result<ControlFlow<()>, FormatError> {
        let limit = self.limits.max_page_bytes;
        let mut unread = pages.len();
        let mut outcome = Ok(ControlFlow::Continue(()));
        let password = Password::empty();
        BlockDecoder::new(
            SINGLE_THREAD,
            block,
            &self.archive,
            &password,
            &mut self.source,
        )
        .for_each_entries(&mut |entry, contents| {
            let Some(&page) = pages.get(&ptr::from_ref(entry)) else {
                io::copy(contents, &mut io::sink())?;
                return Ok(true);
            };
            let Some(bytes) = read_within(contents, limit)? else {
                outcome = Err(page);
                return Ok(false);
            };
            unread = unread.saturating_sub(1);
            if read(page, bytes).is_break() {
                outcome = Ok(ControlFlow::Break(()));
                return Ok(false);
            }
            Ok(unread > 0)
        })
        .map_err(|source| corrupt(&self.path, source))?;
        outcome.map_err(|page| self.page_too_large(page))
    }

    fn block_of(&self, file: usize) -> Option<usize> {
        self.archive
            .stream_map
            .file_block_index
            .get(file)
            .copied()
            .flatten()
    }

    fn page_too_large(&self, index: usize) -> FormatError {
        FormatError::PageTooLarge {
            path: self.path.clone(),
            name: self
                .pages
                .get(index)
                .map(|page| page.name.clone())
                .unwrap_or_default(),
            limit: self.limits.max_page_bytes,
        }
    }
}

pub(crate) fn fingerprint(
    file: File,
    path: &Path,
    limits: &Limits,
) -> Result<Fingerprint, FormatError> {
    let (mut source, archive) = read_archive(file, path, limits)?;
    archive_fingerprint(path, &archive, &mut source)
}

fn read_archive(
    file: File,
    path: &Path,
    limits: &Limits,
) -> Result<(Source, Archive), FormatError> {
    let mut source = BlockReader::new(file).map_err(read_failed(path))?;
    check_header(&mut source, path, limits)?;
    let archive =
        Archive::read(&mut source, &Password::empty()).map_err(|source| corrupt(path, source))?;
    if archive.files.len() > limits.max_entries {
        return Err(FormatError::TooManyEntries {
            path: path.to_owned(),
            count: archive.files.len(),
            limit: limits.max_entries,
        });
    }
    Ok((source, archive))
}

fn archive_fingerprint(
    path: &Path,
    archive: &Archive,
    source: &mut Source,
) -> Result<Fingerprint, FormatError> {
    let images: Option<Vec<ImageEntry>> = archive
        .files
        .iter()
        .filter(|entry| !entry.is_directory && is_fingerprinted_image(&entry.name))
        .map(image_entry)
        .collect();
    match images {
        Some(images) if !images.is_empty() => {
            Fingerprint::pmf1(images).map_err(|source| fingerprint_failed(path, source))
        }
        Some(_) | None => raw_fingerprint(path, source),
    }
}

/// 7z stores an empty file without a stream or CRC, where a zip records the empty file's CRC of zero.
fn image_entry(entry: &ArchiveEntry) -> Option<ImageEntry> {
    if !entry.has_stream {
        return Some(ImageEntry { crc32: 0, size: 0 });
    }
    let crc32 = u32::try_from(entry.crc).ok().filter(|_| entry.has_crc)?;
    Some(ImageEntry {
        crc32,
        size: entry.size,
    })
}

fn is_page(entry: &ArchiveEntry) -> bool {
    !entry.is_directory
        && !entry.is_anti_item
        && !escapes_the_archive(&entry.name)
        && !is_ignored(&entry.name)
        && is_page_image(&entry.name)
}

fn escapes_the_archive(name: &str) -> bool {
    name.starts_with(SEPARATORS) || name.split(SEPARATORS).any(|part| part == PARENT_FOLDER)
}

fn check_block(
    path: &Path,
    archive: &Archive,
    index: usize,
    limits: &Limits,
) -> Result<(), FormatError> {
    let Some(block) = archive.blocks.get(index) else {
        return Ok(());
    };
    let methods = || block.coders.iter().map(Coder::encoder_method_id);
    if methods().any(|method| method == EncoderMethod::ID_AES256_SHA256) {
        return Err(FormatError::Encrypted {
            path: path.to_owned(),
        });
    }
    if let Some(method) = methods().find(|method| !DECODABLE_METHODS.contains(method)) {
        return Err(FormatError::UnsupportedCompression {
            path: path.to_owned(),
            method: method_name(method),
        });
    }
    let dictionary = block
        .coders
        .iter()
        .map(|coder| dictionary_bytes(coder.encoder_method_id(), coder.properties()))
        .fold(0, u64::saturating_add);
    if dictionary > MAX_DICTIONARY_BYTES {
        return Err(FormatError::DictionaryTooLarge {
            path: path.to_owned(),
            limit: MAX_DICTIONARY_BYTES,
        });
    }
    let unpacked = block.get_unpack_size();
    let packed = archive
        .stream_map
        .block_first_pack_stream_index()
        .get(index)
        .and_then(|&stream| archive.pack_sizes().get(stream))
        .copied()
        .unwrap_or_default();
    let expands_too_far = match unpacked.checked_div(packed) {
        Some(ratio) => ratio > limits.max_compression_ratio,
        None => unpacked > 0,
    };
    if expands_too_far {
        let first_entry = archive
            .stream_map
            .block_first_file_index
            .get(index)
            .and_then(|&file| archive.files.get(file));
        return Err(FormatError::SuspiciousCompression {
            path: path.to_owned(),
            name: first_entry
                .map(|entry| entry.name.clone())
                .unwrap_or_default(),
        });
    }
    Ok(())
}

fn method_name(method: &[u8]) -> String {
    EncoderMethod::by_id(method).map_or_else(
        || format!("method {method:02X?}"),
        |known| known.name().to_owned(),
    )
}

/// The 7z format gives an LZMA coder's dictionary as four little-endian bytes after its properties byte, and an LZMA2 coder's as a one-byte size code.
pub(crate) fn dictionary_bytes(method: &[u8], properties: &[u8]) -> u64 {
    if method == EncoderMethod::ID_LZMA {
        properties
            .get(LZMA_DICTIONARY)
            .and_then(|bytes| <[u8; 4]>::try_from(bytes).ok())
            .map_or(0, |bytes| u64::from(u32::from_le_bytes(bytes)))
    } else if method == EncoderMethod::ID_LZMA2 {
        properties
            .first()
            .map_or(0, |&code| lzma2_dictionary_bytes(code))
    } else {
        0
    }
}

fn lzma2_dictionary_bytes(code: u8) -> u64 {
    if code >= LZMA2_LARGEST_DICTIONARY_CODE {
        return u64::from(u32::MAX);
    }
    (2 | u64::from(code & 1)) << (code / 2 + LZMA2_DICTIONARY_SHIFT)
}

fn corrupt(path: &Path, source: sevenz_rust2::Error) -> FormatError {
    let path = path.to_owned();
    if needs_a_password(&source) {
        FormatError::Encrypted { path }
    } else {
        FormatError::CorruptSevenZip { path, source }
    }
}

/// Without its AES feature the decoder reports an encrypted header's coder as an unsupported method rather than asking for a password.
fn needs_a_password(error: &sevenz_rust2::Error) -> bool {
    match error {
        sevenz_rust2::Error::PasswordRequired | sevenz_rust2::Error::MaybeBadPassword(_) => true,
        sevenz_rust2::Error::UnsupportedCompressionMethod(method) => {
            method == EncoderMethod::AES256_SHA256.name()
        }
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_dictionary_size_lzma_and_lzma2_coders_declare() {
        let cases = [
            (EncoderMethod::ID_LZMA, vec![0x5D, 0, 0, 0, 1], 16 * MIB),
            (EncoderMethod::ID_LZMA2, vec![0], 4096),
            (EncoderMethod::ID_LZMA2, vec![1], 6144),
            (EncoderMethod::ID_LZMA2, vec![28], 64 * MIB),
            (EncoderMethod::ID_LZMA2, vec![40], u64::from(u32::MAX)),
            (EncoderMethod::ID_LZMA2, vec![255], u64::from(u32::MAX)),
            (EncoderMethod::ID_LZMA, vec![0x5D], 0),
            (EncoderMethod::ID_BCJ_X86, vec![], 0),
        ];

        let sizes: Vec<u64> = cases
            .iter()
            .map(|(method, properties, _)| dictionary_bytes(method, properties))
            .collect();

        let expected: Vec<u64> = cases.iter().map(|&(_, _, size)| size).collect();
        assert_eq!(sizes, expected);
    }
}
