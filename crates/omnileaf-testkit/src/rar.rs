mod rar4;
mod rar5;

use crate::{ArchiveEntry, FixtureError, Packing};

const FOLDER_SUFFIX: char = '/';
const RAR3_UNPACK_VERSION: u8 = 29;
const SMALLEST_RAR5_DICTIONARY_BYTES: u64 = 128 * 1024;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RarFormat {
    Rar4 {
        unpack_version: u8,
    },
    Rar5 {
        compression_version: u8,
        dictionary_bytes: u64,
    },
}

impl RarFormat {
    pub const RAR4: Self = Self::Rar4 {
        unpack_version: RAR3_UNPACK_VERSION,
    };
    pub const RAR5: Self = Self::Rar5 {
        compression_version: 0,
        dictionary_bytes: SMALLEST_RAR5_DICTIONARY_BYTES,
    };
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RarMethod {
    Stored,
    DeclaredCompressed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RarEncryption {
    Plain,
    Headers,
    Entries,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RarVolume {
    Whole,
    PartOfSet,
    LastEntryContinues,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct RarOptions {
    pub format: RarFormat,
    pub packing: Packing,
    pub method: RarMethod,
    pub encryption: RarEncryption,
    pub volume: RarVolume,
    pub declared_unpacked_size: Option<u64>,
}

impl RarOptions {
    #[must_use]
    pub const fn of(format: RarFormat) -> Self {
        Self {
            format,
            packing: Packing::PerEntry,
            method: RarMethod::Stored,
            encryption: RarEncryption::Plain,
            volume: RarVolume::Whole,
            declared_unpacked_size: None,
        }
    }
}

pub fn cbr(entries: &[ArchiveEntry], options: &RarOptions) -> Result<Vec<u8>, FixtureError> {
    let last = entries.len().saturating_sub(1);
    let members: Vec<Member<'_>> = entries
        .iter()
        .enumerate()
        .map(|(index, entry)| Member::of(entry, options, index == last))
        .collect();
    let members = mark_solid(members, options.packing);
    match options.format {
        RarFormat::Rar4 { unpack_version } => rar4::archive(&members, options, unpack_version),
        RarFormat::Rar5 {
            compression_version,
            dictionary_bytes,
        } => Ok(rar5::archive(
            &members,
            options,
            rar5::Compression {
                version: compression_version,
                dictionary_bytes,
            },
        )),
    }
}

struct Member<'a> {
    name: &'a str,
    bytes: &'a [u8],
    is_directory: bool,
    is_solid: bool,
    continues: bool,
    unpacked_size: u64,
    crc32: u32,
}

impl<'a> Member<'a> {
    fn of(entry: &'a ArchiveEntry, options: &RarOptions, is_last: bool) -> Self {
        let is_directory = entry.name.ends_with(FOLDER_SUFFIX);
        let bytes = entry.bytes.as_slice();
        let unpacked_size = if is_directory {
            0
        } else {
            options.declared_unpacked_size.unwrap_or(bytes.len() as u64)
        };
        Self {
            name: entry.name.trim_end_matches(FOLDER_SUFFIX),
            bytes,
            is_directory,
            is_solid: false,
            continues: is_last && options.volume == RarVolume::LastEntryContinues,
            unpacked_size,
            crc32: crc32(bytes),
        }
    }
}

fn mark_solid(members: Vec<Member<'_>>, packing: Packing) -> Vec<Member<'_>> {
    let mut seen_a_file = false;
    members
        .into_iter()
        .map(|member| {
            let is_solid = packing == Packing::Solid && seen_a_file && !member.is_directory;
            seen_a_file |= !member.is_directory;
            Member { is_solid, ..member }
        })
        .collect()
}

fn crc32(bytes: &[u8]) -> u32 {
    let mut crc = flate2::Crc::new();
    crc.update(bytes);
    crc.sum()
}
