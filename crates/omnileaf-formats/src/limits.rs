use std::io::{self, Read};

const MIB: u64 = 1024 * 1024;

pub(crate) const COMIC_INFO_LIMIT: u64 = MIB;
pub(crate) const COMIC_INFO_NAME: &str = "ComicInfo.xml";

/// Bounds that keep a damaged or hostile archive from exhausting memory or disk.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Limits {
    pub max_entries: usize,
    pub max_page_bytes: u64,
    pub max_total_bytes: u64,
    pub max_compression_ratio: u64,
}

impl Default for Limits {
    fn default() -> Self {
        Self {
            max_entries: 10_000,
            max_page_bytes: 256 * MIB,
            max_total_bytes: 4 * 1024 * MIB,
            max_compression_ratio: 100,
        }
    }
}

/// Reads all of `reader`, or gives `None` once it holds more than `limit` bytes.
pub(crate) fn read_within(reader: impl Read, limit: u64) -> io::Result<Option<Vec<u8>>> {
    let mut bytes = Vec::new();
    reader
        .take(limit.saturating_add(1))
        .read_to_end(&mut bytes)?;
    Ok((u64::try_from(bytes.len()).unwrap_or(u64::MAX) <= limit).then_some(bytes))
}
