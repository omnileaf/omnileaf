const MIB: u64 = 1024 * 1024;

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
