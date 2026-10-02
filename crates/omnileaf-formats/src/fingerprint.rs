use std::{
    collections::BTreeMap,
    fs::File,
    io::{self, Read, Seek, SeekFrom},
    ops::Range,
    path::{Path, PathBuf},
};

use omnileaf_sync_proto::{
    Fingerprint, FingerprintError, FolderImage, FolderManifest, ImageEntry, RAW1_SAMPLE_COUNT,
};

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

/// Fingerprints an archive by its images' CRC-32s and sizes, or by sampled bytes when it has none, and a folder by its images' names, sizes and outer edges.
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

/// Reads only the head of the first image and the tail of the last, so scanning never reads a whole folder.
fn folder_fingerprint(path: &Path, limits: &Limits) -> Result<Fingerprint, FormatError> {
    let mut files = BTreeMap::new();
    let mut images = Vec::new();
    for entry in read_folder(path, limits)? {
        let file = entry.path();
        let metadata = entry
            .metadata()
            .map_err(|source| read_failed(&file, source))?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if metadata.is_file() && is_fingerprinted_image(&name) {
            images.push(FolderImage {
                name: name.clone(),
                size: metadata.len(),
            });
            files.insert(name, file);
        }
    }
    let manifest =
        FolderManifest::new(images).map_err(|source| fingerprint_failed(path, source))?;
    let head = read_image_range(&files, manifest.first(), manifest.head_range())?;
    let tail = read_image_range(&files, manifest.last(), manifest.tail_range())?;
    Fingerprint::dir1(&manifest, &head, &tail).map_err(|source| fingerprint_failed(path, source))
}

fn read_image_range(
    files: &BTreeMap<String, PathBuf>,
    image: &FolderImage,
    range: Range<u64>,
) -> Result<Vec<u8>, FormatError> {
    let file = files.get(&image.name).ok_or_else(|| FormatError::Read {
        path: PathBuf::from(&image.name),
        source: io::ErrorKind::NotFound.into(),
    })?;
    File::open(file)
        .and_then(|mut opened| read_range(&mut opened, range))
        .map_err(|source| read_failed(file, source))
}

fn read_failed(path: &Path, source: io::Error) -> FormatError {
    FormatError::Read {
        path: path.to_owned(),
        source,
    }
}

fn raw_fingerprint(path: &Path, mut reader: impl Read + Seek) -> Result<Fingerprint, FormatError> {
    let read_failed = |source| FormatError::Read {
        path: path.to_owned(),
        source,
    };
    let size = reader.seek(SeekFrom::End(0)).map_err(read_failed)?;
    let mut samples: [Vec<u8>; RAW1_SAMPLE_COUNT] = Default::default();
    for (sample, range) in samples.iter_mut().zip(Fingerprint::raw1_ranges(size)) {
        *sample = read_range(&mut reader, range).map_err(read_failed)?;
    }
    Fingerprint::raw1(size, &samples.each_ref().map(Vec::as_slice))
        .map_err(|source| fingerprint_failed(path, source))
}

fn read_range(reader: &mut (impl Read + Seek), range: Range<u64>) -> io::Result<Vec<u8>> {
    reader.seek(SeekFrom::Start(range.start))?;
    let mut bytes = Vec::new();
    reader
        .take(range.end - range.start)
        .read_to_end(&mut bytes)?;
    Ok(bytes)
}

fn fingerprint_failed(path: &Path, source: FingerprintError) -> FormatError {
    FormatError::Fingerprint {
        path: path.to_owned(),
        source,
    }
}
