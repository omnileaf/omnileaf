use std::{
    collections::BTreeMap,
    io::{self, Read, Seek, SeekFrom},
    ops::Range,
    path::{Path, PathBuf},
    sync::Arc,
};

use omnileaf_sync_proto::{
    Fingerprint, FingerprintError, FolderImage, FolderManifest, ImageEntry, RAW1_SAMPLE_COUNT,
};
use zip::ZipArchive;

use crate::{
    Entry, EntryKind, FormatError, Limits, LocalStorage, Storage,
    container::Container,
    entries::is_fingerprinted_image,
    error::read_failed,
    folder::read_folder,
    zip_book::{archive_from, corrupt},
};

pub fn fingerprint_book(path: &Path) -> Result<Fingerprint, FormatError> {
    fingerprint_book_with(path, &Limits::default())
}

/// Fingerprints an archive by its images' CRC-32s and sizes, or by sampled bytes when it has none, and a folder by its images' names, sizes and outer edges.
pub fn fingerprint_book_with(path: &Path, limits: &Limits) -> Result<Fingerprint, FormatError> {
    match Container::of(&LocalStorage, path)? {
        Container::Folder => {
            let entries = read_folder(&LocalStorage, path, limits)?;
            folder_fingerprint(&LocalStorage, path, &entries)
        }
        Container::Zip(file) => {
            let file = Arc::new(file);
            let mut archive = archive_from(Arc::clone(&file), path, limits)?;
            archive_fingerprint(path, &mut archive, &*file)
        }
    }
}

/// Takes each image's CRC-32 and size from the central directory, so no entry is decompressed, and samples `raw` only when the archive has no images.
pub(crate) fn archive_fingerprint<R: Read + Seek>(
    path: &Path,
    archive: &mut ZipArchive<R>,
    raw: impl Read + Seek,
) -> Result<Fingerprint, FormatError> {
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
        return raw_fingerprint(path, raw);
    }
    Fingerprint::pmf1(images).map_err(|source| fingerprint_failed(path, source))
}

/// Reads only the head of the first image and the tail of the last, so scanning never reads a whole folder.
pub(crate) fn folder_fingerprint(
    storage: &dyn Storage,
    path: &Path,
    entries: &[Entry],
) -> Result<Fingerprint, FormatError> {
    let mut files = BTreeMap::new();
    let mut images = Vec::new();
    for entry in entries {
        let EntryKind::File { size } = entry.kind else {
            continue;
        };
        let name = entry.name.to_string_lossy().into_owned();
        if !is_fingerprinted_image(&name) {
            continue;
        }
        images.push(FolderImage {
            name: name.clone(),
            size,
        });
        files.insert(name, path.join(&entry.name));
    }
    let manifest =
        FolderManifest::new(images).map_err(|source| fingerprint_failed(path, source))?;
    let head = read_image_range(storage, &files, manifest.first(), manifest.head_range())?;
    let tail = read_image_range(storage, &files, manifest.last(), manifest.tail_range())?;
    Fingerprint::dir1(&manifest, &head, &tail).map_err(|source| fingerprint_failed(path, source))
}

fn read_image_range(
    storage: &dyn Storage,
    files: &BTreeMap<String, PathBuf>,
    image: &FolderImage,
    range: Range<u64>,
) -> Result<Vec<u8>, FormatError> {
    let file = files
        .get(&image.name)
        .ok_or_else(|| read_failed(Path::new(&image.name))(io::ErrorKind::NotFound.into()))?;
    storage
        .open(file)
        .and_then(|mut opened| read_range(&mut opened, range))
        .map_err(read_failed(file))
}

fn raw_fingerprint(path: &Path, mut reader: impl Read + Seek) -> Result<Fingerprint, FormatError> {
    let size = reader.seek(SeekFrom::End(0)).map_err(read_failed(path))?;
    let mut samples: [Vec<u8>; RAW1_SAMPLE_COUNT] = Default::default();
    for (sample, range) in samples.iter_mut().zip(Fingerprint::raw1_ranges(size)) {
        *sample = read_range(&mut reader, range).map_err(read_failed(path))?;
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
