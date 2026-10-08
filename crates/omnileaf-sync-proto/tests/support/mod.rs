#![expect(
    clippy::unwrap_used,
    reason = "the sample files are small and generated, so a failed set-up should stop the test"
)]

use std::ops::Range;

use omnileaf_sync_proto::{Fingerprint, FolderImage, FolderManifest, RAW1_SAMPLE_COUNT};

const SAMPLE_BYTE_MODULUS: u64 = 251;

pub(crate) fn sample_file(size: u64) -> Vec<u8> {
    (0..size)
        .map(|index| u8::try_from(index % SAMPLE_BYTE_MODULUS).unwrap())
        .collect()
}

fn sample(content: &[u8], range: Range<u64>) -> &[u8] {
    let start = usize::try_from(range.start).unwrap();
    let end = usize::try_from(range.end).unwrap();
    content.get(start..end).unwrap()
}

pub(crate) fn raw1_samples(content: &[u8]) -> [&[u8]; RAW1_SAMPLE_COUNT] {
    Fingerprint::raw1_ranges(content.len() as u64).map(|range| sample(content, range))
}

pub(crate) fn dir1_of_sample_files(images: Vec<FolderImage>) -> Fingerprint {
    let manifest = FolderManifest::new(images).unwrap();
    let first = sample_file(manifest.first().size);
    let last = sample_file(manifest.last().size);
    Fingerprint::dir1(
        &manifest,
        sample(&first, manifest.head_range()),
        sample(&last, manifest.tail_range()),
    )
    .unwrap()
}
