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
    First,
    Middle,
    Last,
}

impl RarVolume {
    const fn follows_another(self) -> bool {
        match self {
            Self::Middle | Self::Last => true,
            Self::Whole | Self::First => false,
        }
    }

    const fn precedes_another(self) -> bool {
        match self {
            Self::First | Self::Middle => true,
            Self::Whole | Self::Last => false,
        }
    }

    const fn number(self) -> Option<u64> {
        match self {
            Self::Middle => Some(1),
            Self::Last => Some(2),
            Self::Whole | Self::First => None,
        }
    }
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
    let members: Vec<Member<'_>> = entries
        .iter()
        .map(|entry| Member::of(entry, options))
        .collect::<Result<_, _>>()?;
    let members = mark_split_files(mark_solid(members, options.packing), options.volume);
    match options.format {
        RarFormat::Rar4 { unpack_version } => rar4::archive(&members, options, unpack_version),
        RarFormat::Rar5 {
            compression_version,
            dictionary_bytes,
        } => rar5::archive(
            &members,
            options,
            rar5::Compression {
                version: compression_version,
                dictionary_bytes,
            },
        ),
    }
}

#[derive(Clone, Copy, Debug, Default)]
struct VolumeSplit {
    from_previous: bool,
    into_next: bool,
}

struct Member<'a> {
    name: &'a str,
    bytes: &'a [u8],
    is_directory: bool,
    is_solid: bool,
    split: VolumeSplit,
    unpacked_size: u64,
    crc32: u32,
}

impl<'a> Member<'a> {
    fn of(entry: &'a ArchiveEntry, options: &RarOptions) -> Result<Self, FixtureError> {
        let is_directory = entry.name.ends_with(FOLDER_SUFFIX);
        let bytes = entry.bytes.as_slice();
        if is_directory && !bytes.is_empty() {
            return Err(FixtureError::RarFolderWithBytes {
                name: entry.name.clone(),
            });
        }
        let unpacked_size = if is_directory {
            0
        } else {
            options.declared_unpacked_size.unwrap_or(bytes.len() as u64)
        };
        Ok(Self {
            name: entry.name.trim_end_matches(FOLDER_SUFFIX),
            bytes,
            is_directory,
            is_solid: false,
            split: VolumeSplit::default(),
            unpacked_size,
            crc32: crc32(bytes),
        })
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

fn mark_split_files(mut members: Vec<Member<'_>>, volume: RarVolume) -> Vec<Member<'_>> {
    let is_file = |member: &&mut Member<'_>| !member.is_directory;
    if let Some(first) = members.iter_mut().find(is_file) {
        first.split.from_previous = volume.follows_another();
    }
    if let Some(last) = members.iter_mut().rev().find(is_file) {
        last.split.into_next = volume.precedes_another();
    }
    members
}

fn crc32(bytes: &[u8]) -> u32 {
    let mut crc = flate2::Crc::new();
    crc.update(bytes);
    crc.sum()
}
