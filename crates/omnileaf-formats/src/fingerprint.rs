use std::{
    fs::File,
    io::{self, Read, Seek, SeekFrom},
    ops::Range,
    path::Path,
};

use flate2::CrcReader;
use omnileaf_sync_proto::{Fingerprint, FingerprintError, ImageEntry, RAW1_SAMPLE_COUNT};

use crate::{
    FormatError, Limits,
    container::Container,
    entries::is_fingerprinted_image,
    folder::read_folder,
    zip_book::{corrupt, open_archive},
};

pub fn fingerprint_book(path: &Path) -> Result<Fingerprint, FormatError> {
    fingerprint_book_with(path, &Limits::default())
}

/// Fingerprints a book by its images' CRC-32s and sizes, falling back to sampled bytes for an archive without images.
pub fn fingerprint_book_with(path: &Path, limits: &Limits) -> Result<Fingerprint, FormatError> {
    match Container::of(path)? {
        Container::Folder => folder_fingerprint(path, limits),
        Container::Zip => archive_fingerprint(path, limits),
    }
}

/// Takes each image's CRC-32 and size from the central directory, so no entry is decompressed.
fn archive_fingerprint(path: &Path, limits: &Limits) -> Result<Fingerprint, FormatError> {
    let mut archive = open_archive(path, limits)?;
    let mut images = Vec::new();
    for index in 0..archive.len() {
        let entry = archive
            .by_index_raw(index)
            .map_err(|source| corrupt(path, source))?;
        if !entry.is_dir() && is_fingerprinted_image(entry.name()) {
            images.push(ImageEntry {
                crc32: entry.crc32(),
                size: entry.size(),
            });
        }
    }
    if images.is_empty() {
        return raw_fingerprint(path, archive.into_inner());
    }
    Fingerprint::pmf1(images).map_err(|source| fingerprint_failed(path, source))
}

fn folder_fingerprint(path: &Path, limits: &Limits) -> Result<Fingerprint, FormatError> {
    let mut images = Vec::new();
    for entry in read_folder(path, limits)? {
        let file = entry.path();
        let read_failed = |source| FormatError::Read {
            path: file.clone(),
            source,
        };
        let name = entry.file_name().to_string_lossy().into_owned();
        if entry.metadata().map_err(read_failed)?.is_file() && is_fingerprinted_image(&name) {
            images.push(image_entry(&file).map_err(read_failed)?);
        }
    }
    Fingerprint::pmf1(images).map_err(|source| fingerprint_failed(path, source))
}

fn image_entry(file: &Path) -> io::Result<ImageEntry> {
    let mut reader = CrcReader::new(File::open(file)?);
    let size = io::copy(&mut reader, &mut io::sink())?;
    Ok(ImageEntry {
        crc32: reader.crc().sum(),
        size,
    })
}

fn raw_fingerprint(path: &Path, mut file: File) -> Result<Fingerprint, FormatError> {
    let read_failed = |source| FormatError::Read {
        path: path.to_owned(),
        source,
    };
    let size = file.metadata().map_err(read_failed)?.len();
    let mut samples: [Vec<u8>; RAW1_SAMPLE_COUNT] = Default::default();
    for (sample, range) in samples.iter_mut().zip(Fingerprint::raw1_ranges(size)) {
        *sample = read_range(&mut file, range).map_err(read_failed)?;
    }
    Fingerprint::raw1(size, &samples.each_ref().map(Vec::as_slice))
        .map_err(|source| fingerprint_failed(path, source))
}

fn read_range(file: &mut File, range: Range<u64>) -> io::Result<Vec<u8>> {
    file.seek(SeekFrom::Start(range.start))?;
    let mut bytes = Vec::new();
    file.take(range.end - range.start).read_to_end(&mut bytes)?;
    Ok(bytes)
}

fn fingerprint_failed(path: &Path, source: FingerprintError) -> FormatError {
    FormatError::Fingerprint {
        path: path.to_owned(),
        source,
    }
}
