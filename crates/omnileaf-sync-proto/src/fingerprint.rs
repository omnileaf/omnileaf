use std::{array, ops::Range};

use crate::norm;

pub const RAW1_SAMPLE_COUNT: usize = 10;

const PMF1_CONTEXT: &str = "omnileaf.app pmf v1";
const DIR1_CONTEXT: &str = "omnileaf.app dir v1";
const DIR1_EDGE_LENGTH: u64 = 64 * 1024;
const RAW1_CONTEXT: &str = "omnileaf.app raw v1";
const RAW1_EDGE_LENGTH: u64 = 64 * 1024;
const RAW1_SLICE_LENGTH: u64 = 16 * 1024;
const RAW1_SLICE_SPACING: u64 = 9;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum FingerprintKind {
    Pmf1,
    Dir1,
    Raw1,
}

/// An image entry's CRC-32 and uncompressed size, as the archive's own index records them.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct ImageEntry {
    pub crc32: u32,
    pub size: u64,
}

/// An image file directly inside a book folder, by its file name and size in bytes.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FolderImage {
    pub name: String,
    pub size: u64,
}

/// A folder's images in `dir1` order, which decides the two files whose edges [`Fingerprint::dir1`] samples.
#[derive(Clone, Debug)]
pub struct FolderManifest {
    entries: Vec<(String, u64)>,
    first: FolderImage,
    last: FolderImage,
}

impl FolderManifest {
    /// Fails with [`FingerprintError::NoImages`] for a folder without images; names that normalise alike are ordered by size, then by their own bytes.
    pub fn new(images: impl IntoIterator<Item = FolderImage>) -> Result<Self, FingerprintError> {
        let mut keyed: Vec<(String, FolderImage)> = images
            .into_iter()
            .map(|image| (norm(&image.name), image))
            .collect();
        keyed.sort_unstable_by(|(left_key, left), (right_key, right)| {
            (left_key, left.size, &left.name).cmp(&(right_key, right.size, &right.name))
        });
        let (Some((_, first)), Some((_, last))) = (keyed.first(), keyed.last()) else {
            return Err(FingerprintError::NoImages);
        };
        let (first, last) = (first.clone(), last.clone());
        let entries = keyed
            .into_iter()
            .map(|(key, image)| (key, image.size))
            .collect();
        Ok(Self {
            entries,
            first,
            last,
        })
    }

    #[must_use]
    pub const fn first(&self) -> &FolderImage {
        &self.first
    }

    #[must_use]
    pub const fn last(&self) -> &FolderImage {
        &self.last
    }

    /// The bytes of the first file that [`Fingerprint::dir1`] takes as its head sample.
    #[must_use]
    pub fn head_range(&self) -> Range<u64> {
        0..DIR1_EDGE_LENGTH.min(self.first.size)
    }

    /// The bytes of the last file that [`Fingerprint::dir1`] takes as its tail sample.
    #[must_use]
    pub fn tail_range(&self) -> Range<u64> {
        let size = self.last.size;
        size - DIR1_EDGE_LENGTH.min(size)..size
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct Fingerprint {
    kind: FingerprintKind,
    digest: [u8; 32],
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum FingerprintError {
    #[error("a book without images has no fingerprint of its images")]
    NoImages,
    #[error("{count} image entries do not fit the 32-bit entry count")]
    TooManyImages { count: usize },
    #[error("an image name of {length} bytes does not fit its 32-bit length prefix")]
    NameTooLong { length: usize },
    #[error("sample {index} holds {actual} bytes where its range holds {expected}")]
    SampleLength {
        index: usize,
        expected: u64,
        actual: usize,
    },
}

impl Fingerprint {
    #[must_use]
    pub const fn kind(&self) -> FingerprintKind {
        self.kind
    }

    #[must_use]
    pub const fn as_bytes(&self) -> &[u8; 32] {
        &self.digest
    }

    /// Fails with [`FingerprintError::NoImages`] for an archive without images, which takes [`Fingerprint::raw1`] instead.
    pub fn pmf1(entries: impl IntoIterator<Item = ImageEntry>) -> Result<Self, FingerprintError> {
        let mut entries: Vec<ImageEntry> = entries.into_iter().collect();
        if entries.is_empty() {
            return Err(FingerprintError::NoImages);
        }
        let count = entry_count(entries.len())?;
        entries.sort_unstable();
        let mut hasher = blake3::Hasher::new_derive_key(PMF1_CONTEXT);
        hasher.update(&count.to_le_bytes());
        for entry in &entries {
            hasher.update(&entry.crc32.to_le_bytes());
            hasher.update(&entry.size.to_le_bytes());
        }
        Ok(Self::finish(FingerprintKind::Pmf1, &hasher))
    }

    /// Takes the bytes of [`FolderManifest::head_range`] and [`FolderManifest::tail_range`].
    pub fn dir1(
        manifest: &FolderManifest,
        head: &[u8],
        tail: &[u8],
    ) -> Result<Self, FingerprintError> {
        let mut hasher = blake3::Hasher::new_derive_key(DIR1_CONTEXT);
        hasher.update(&entry_count(manifest.entries.len())?.to_le_bytes());
        for (name, size) in &manifest.entries {
            let length = u32::try_from(name.len())
                .map_err(|_| FingerprintError::NameTooLong { length: name.len() })?;
            hasher.update(&length.to_le_bytes());
            hasher.update(name.as_bytes());
            hasher.update(&size.to_le_bytes());
        }
        let ranges = [manifest.head_range(), manifest.tail_range()];
        for (index, (sample, range)) in [head, tail].into_iter().zip(ranges).enumerate() {
            check_sample(index, sample, &range)?;
            hasher.update(sample);
        }
        Ok(Self::finish(FingerprintKind::Dir1, &hasher))
    }

    /// The byte ranges `raw1` hashes, in order: the first and last 64 KiB, then 16 KiB at `size * i / 9` for `i` in 1..=8, each cut short at the end of the file.
    #[must_use]
    pub fn raw1_ranges(size: u64) -> [Range<u64>; RAW1_SAMPLE_COUNT] {
        let edge = RAW1_EDGE_LENGTH.min(size);
        array::from_fn(|position| match position {
            0 => 0..edge,
            1 => size - edge..size,
            slice => {
                let start = ninth_of(size, slice as u64 - 1);
                start..start.saturating_add(RAW1_SLICE_LENGTH).min(size)
            }
        })
    }

    /// Takes the bytes of each range from [`Fingerprint::raw1_ranges`], in the same order.
    pub fn raw1(size: u64, samples: &[&[u8]; RAW1_SAMPLE_COUNT]) -> Result<Self, FingerprintError> {
        let mut hasher = blake3::Hasher::new_derive_key(RAW1_CONTEXT);
        hasher.update(&size.to_le_bytes());
        for (index, (sample, range)) in samples.iter().zip(Self::raw1_ranges(size)).enumerate() {
            check_sample(index, sample, &range)?;
            hasher.update(sample);
        }
        Ok(Self::finish(FingerprintKind::Raw1, &hasher))
    }

    fn finish(kind: FingerprintKind, hasher: &blake3::Hasher) -> Self {
        Self {
            kind,
            digest: *hasher.finalize().as_bytes(),
        }
    }
}

fn entry_count(count: usize) -> Result<u32, FingerprintError> {
    u32::try_from(count).map_err(|_| FingerprintError::TooManyImages { count })
}

fn check_sample(index: usize, sample: &[u8], range: &Range<u64>) -> Result<(), FingerprintError> {
    let expected = range.end - range.start;
    if u64::try_from(sample.len()) == Ok(expected) {
        return Ok(());
    }
    Err(FingerprintError::SampleLength {
        index,
        expected,
        actual: sample.len(),
    })
}

/// `size * ninths / 9` rounded down, without overflowing for any file size.
const fn ninth_of(size: u64, ninths: u64) -> u64 {
    size / RAW1_SLICE_SPACING * ninths + size % RAW1_SLICE_SPACING * ninths / RAW1_SLICE_SPACING
}
