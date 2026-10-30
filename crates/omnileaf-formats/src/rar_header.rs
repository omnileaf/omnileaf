mod fields;
mod gate;
mod rar4;
mod rar5;
mod source;

use std::{
    io::{Read, Seek},
    path::Path,
};

use crate::{FormatError, Limits, Page};
use gate::Gate;
use source::Source;

const RAR4_SIGNATURE: &[u8] = b"Rar!\x1a\x07\x00";
const RAR5_SIGNATURE: &[u8] = b"Rar!\x1a\x07\x01\x00";
const MIB: u64 = 1024 * 1024;
const MAX_HEADER_BYTES: u64 = 2 * MIB;
/// libarchive allocates about twice the window an entry declares and refuses any above 64 MiB.
#[cfg(not(any(target_os = "android", target_os = "ios")))]
const MAX_DICTIONARY_BYTES: u64 = 64 * MIB;
/// libarchive allocates about twice the window an entry declares, which must fit a phone's 96 MiB allocation budget.
#[cfg(any(target_os = "android", target_os = "ios"))]
const MAX_DICTIONARY_BYTES: u64 = 32 * MIB;
const NO_SIGNATURE: &str = "the file has no RAR signature";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RarFormat {
    Rar4,
    Rar5,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RarEntry {
    pub name: String,
    pub index: usize,
    pub packed_size: u64,
    pub unpacked_size: u64,
    pub crc32: Option<u32>,
    pub is_solid: bool,
    pub data_offset: u64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RarListing {
    pub format: RarFormat,
    pub entries: Vec<RarEntry>,
    pub pages: Vec<Page>,
    pub page_entries: Vec<usize>,
}

impl RarListing {
    /// The decoder trusts what a RAR's headers declare, so this walks and checks every header before any entry is decoded.
    pub fn read(
        source: &mut (impl Read + Seek),
        path: &Path,
        limits: &Limits,
    ) -> Result<Self, FormatError> {
        let mut source = Source::new(source, path)?;
        let mut gate = Gate::new(path, limits);
        let format = if source.starts_with(RAR5_SIGNATURE)? {
            rar5::walk(&mut source, &mut gate)?;
            RarFormat::Rar5
        } else if source.starts_with(RAR4_SIGNATURE)? {
            rar4::walk(&mut source, &mut gate)?;
            RarFormat::Rar4
        } else {
            return Err(gate.corrupt(NO_SIGNATURE));
        };
        gate.finish(format)
    }
}
