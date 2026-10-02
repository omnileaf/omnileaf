use std::{array, ops::Range};

pub const RAW1_SAMPLE_COUNT: usize = 10;

const PMF1_CONTEXT: &str = "omnileaf.app pmf v1";
const RAW1_CONTEXT: &str = "omnileaf.app raw v1";
const RAW1_EDGE_LENGTH: u64 = 64 * 1024;
const RAW1_SLICE_LENGTH: u64 = 16 * 1024;
const RAW1_SLICE_SPACING: u64 = 9;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum FingerprintKind {
    Pmf1,
    Raw1,
}

/// An image entry's CRC-32 and uncompressed size, as the archive's own index records them.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct ImageEntry {
    pub crc32: u32,
    pub size: u64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct Fingerprint {
    kind: FingerprintKind,
    digest: [u8; 32],
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum FingerprintError {
    #[error("an archive without images has no page-manifest fingerprint")]
    NoImages,
    #[error("{count} image entries do not fit the 32-bit entry count")]
    TooManyImages { count: usize },
    #[error("raw sample {index} holds {actual} bytes where its range holds {expected}")]
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
        let count = u32::try_from(entries.len()).map_err(|_| FingerprintError::TooManyImages {
            count: entries.len(),
        })?;
        entries.sort_unstable();
        let mut hasher = blake3::Hasher::new_derive_key(PMF1_CONTEXT);
        hasher.update(&count.to_le_bytes());
        for entry in &entries {
            hasher.update(&entry.crc32.to_le_bytes());
            hasher.update(&entry.size.to_le_bytes());
        }
        Ok(Self::finish(FingerprintKind::Pmf1, &hasher))
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
            let expected = range.end - range.start;
            if u64::try_from(sample.len()) != Ok(expected) {
                return Err(FingerprintError::SampleLength {
                    index,
                    expected,
                    actual: sample.len(),
                });
            }
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

/// `size * ninths / 9` rounded down, without overflowing for any file size.
const fn ninth_of(size: u64, ninths: u64) -> u64 {
    size / RAW1_SLICE_SPACING * ninths + size % RAW1_SLICE_SPACING * ninths / RAW1_SLICE_SPACING
}
