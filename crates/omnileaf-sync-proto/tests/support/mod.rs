#![expect(
    clippy::unwrap_used,
    reason = "the sample files are small and generated, so a failed set-up should stop the test"
)]

use omnileaf_sync_proto::{Fingerprint, RAW1_SAMPLE_COUNT};

const SAMPLE_BYTE_MODULUS: u64 = 251;

pub(crate) fn sample_file(size: u64) -> Vec<u8> {
    (0..size)
        .map(|index| u8::try_from(index % SAMPLE_BYTE_MODULUS).unwrap())
        .collect()
}

pub(crate) fn raw1_samples(content: &[u8]) -> [&[u8]; RAW1_SAMPLE_COUNT] {
    Fingerprint::raw1_ranges(content.len() as u64).map(|range| {
        let start = usize::try_from(range.start).unwrap();
        let end = usize::try_from(range.end).unwrap();
        content.get(start..end).unwrap()
    })
}
