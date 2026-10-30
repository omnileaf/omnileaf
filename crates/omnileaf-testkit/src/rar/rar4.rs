use super::{Member, RarEncryption, RarMethod, RarOptions, RarVolume, crc32};
use crate::{FixtureError, Packing};

const SIGNATURE: &[u8] = b"Rar!\x1a\x07\x00";
const MAIN: u8 = 0x73;
const FILE: u8 = 0x74;
const END: u8 = 0x7B;
const NO_FLAGS: u16 = 0;
const BLOCK_PREFIX_LENGTH: usize = 7;
const MAIN_IS_VOLUME: u16 = 0x0001;
const MAIN_IS_SOLID: u16 = 0x0008;
const MAIN_IS_ENCRYPTED: u16 = 0x0080;
const MAIN_RESERVED: [u8; 6] = [0; 6];
const FILE_CONTINUES: u16 = 0x0002;
const FILE_IS_ENCRYPTED: u16 = 0x0004;
const FILE_IS_SOLID: u16 = 0x0010;
const FILE_IS_DIRECTORY: u16 = 0x00E0;
const FILE_HAS_LARGE_SIZES: u16 = 0x0100;
const FILE_HAS_UNICODE_NAME: u16 = 0x0200;
const FILE_HAS_DATA: u16 = 0x8000;
const HOST_WINDOWS: u8 = 2;
const ATTRIBUTE_ARCHIVE: u32 = 0x20;
const ATTRIBUTE_DIRECTORY: u32 = 0x10;
const STORED: u8 = 0x30;
const NORMAL: u8 = 0x33;
/// DOS packs a date as years since 1980, month and day above the time of day, so this is midnight on 1 January 1980.
const DOS_EPOCH: u32 = 0x0021_0000;
const FORWARD_SLASH: char = '/';
const BACKSLASH: &str = "\\";

pub(super) fn archive(
    members: &[Member<'_>],
    options: &RarOptions,
    unpack_version: u8,
) -> Result<Vec<u8>, FixtureError> {
    let mut archive = SIGNATURE.to_vec();
    archive.extend(block(MAIN, main_flags(options), &MAIN_RESERVED)?);
    for member in members {
        archive.extend(file_block(member, options, unpack_version)?);
        if !member.is_directory {
            archive.extend_from_slice(member.bytes);
        }
    }
    archive.extend(block(END, NO_FLAGS, &[])?);
    Ok(archive)
}

fn main_flags(options: &RarOptions) -> u16 {
    let mut flags = NO_FLAGS;
    if options.volume == RarVolume::PartOfSet {
        flags |= MAIN_IS_VOLUME;
    }
    if options.packing == Packing::Solid {
        flags |= MAIN_IS_SOLID;
    }
    if options.encryption == RarEncryption::Headers {
        flags |= MAIN_IS_ENCRYPTED;
    }
    flags
}

fn file_block(
    member: &Member<'_>,
    options: &RarOptions,
    unpack_version: u8,
) -> Result<Vec<u8>, FixtureError> {
    let name = member.name.replace(FORWARD_SLASH, BACKSLASH);
    let name_length = u16::try_from(name.len()).map_err(|_| FixtureError::RarHeaderTooLong)?;
    let packed_size = member.bytes.len() as u64;
    let mut flags = file_flags(member, options);
    if !name.is_ascii() {
        flags |= FILE_HAS_UNICODE_NAME;
    }
    let is_large =
        u32::try_from(packed_size).is_err() || u32::try_from(member.unpacked_size).is_err();
    if is_large {
        flags |= FILE_HAS_LARGE_SIZES;
    }
    let (method, attributes) = if member.is_directory {
        (STORED, ATTRIBUTE_DIRECTORY)
    } else {
        (method_byte(options.method), ATTRIBUTE_ARCHIVE)
    };
    let mut fields = [
        &low_half(packed_size).to_le_bytes()[..],
        &low_half(member.unpacked_size).to_le_bytes(),
        &[HOST_WINDOWS],
        &member.crc32.to_le_bytes(),
        &DOS_EPOCH.to_le_bytes(),
        &[unpack_version, method],
        &name_length.to_le_bytes(),
        &attributes.to_le_bytes(),
    ]
    .concat();
    if is_large {
        fields.extend(high_half(packed_size).to_le_bytes());
        fields.extend(high_half(member.unpacked_size).to_le_bytes());
    }
    fields.extend(name.as_bytes());
    block(FILE, flags, &fields)
}

fn file_flags(member: &Member<'_>, options: &RarOptions) -> u16 {
    let mut flags = FILE_HAS_DATA;
    if member.is_directory {
        flags |= FILE_IS_DIRECTORY;
    }
    if member.is_solid {
        flags |= FILE_IS_SOLID;
    }
    if member.continues {
        flags |= FILE_CONTINUES;
    }
    if options.encryption == RarEncryption::Entries && !member.is_directory {
        flags |= FILE_IS_ENCRYPTED;
    }
    flags
}

const fn method_byte(method: RarMethod) -> u8 {
    match method {
        RarMethod::Stored => STORED,
        RarMethod::DeclaredCompressed => NORMAL,
    }
}

fn low_half(value: u64) -> u32 {
    u32::try_from(value & u64::from(u32::MAX)).unwrap_or_default()
}

fn high_half(value: u64) -> u32 {
    u32::try_from(value >> u32::BITS).unwrap_or_default()
}

/// RAR 4 checks each block with the low 16 bits of a CRC32 taken from the block's type byte onwards.
fn block(kind: u8, flags: u16, fields: &[u8]) -> Result<Vec<u8>, FixtureError> {
    let size = u16::try_from(BLOCK_PREFIX_LENGTH + fields.len())
        .map_err(|_| FixtureError::RarHeaderTooLong)?;
    let checked = [
        &[kind][..],
        &flags.to_le_bytes(),
        &size.to_le_bytes(),
        fields,
    ]
    .concat();
    let crc16 = u16::try_from(crc32(&checked) & u32::from(u16::MAX)).unwrap_or_default();
    Ok([&crc16.to_le_bytes()[..], &checked].concat())
}

#[cfg(test)]
mod tests {
    use crate::{
        ArchiveEntry, Packing, RarEncryption, RarFormat, RarMethod, RarOptions, RarVolume, cbr,
    };

    const SIGNATURE: &[u8] = b"Rar!\x1a\x07\x00";
    const MAIN: u8 = 0x73;
    const FILE: u8 = 0x74;
    const END: u8 = 0x7B;
    const BLOCK_PREFIX_LENGTH: usize = 7;
    const MAIN_IS_VOLUME: u16 = 0x0001;
    const MAIN_IS_SOLID: u16 = 0x0008;
    const MAIN_IS_ENCRYPTED: u16 = 0x0080;
    const FILE_CONTINUES: u16 = 0x0002;
    const FILE_IS_ENCRYPTED: u16 = 0x0004;
    const FILE_IS_SOLID: u16 = 0x0010;
    const FILE_IS_DIRECTORY: u16 = 0x00E0;
    const FILE_HAS_LARGE_SIZES: u16 = 0x0100;
    const FILE_HAS_UNICODE_NAME: u16 = 0x0200;
    const NAME_LENGTH_AT: usize = 19;
    const NAME_AT: usize = 25;

    type StoredFile<'a> = (&'a [u8], &'a [u8], u32, u32, u8);

    struct Block {
        kind: u8,
        flags: u16,
        fields: Vec<u8>,
        data: Vec<u8>,
    }

    impl Block {
        fn u32_at(&self, at: usize) -> u32 {
            u32::from_le_bytes(self.fields[at..at + 4].try_into().unwrap())
        }

        fn name(&self) -> &[u8] {
            let length = usize::from(u16::from_le_bytes(
                self.fields[NAME_LENGTH_AT..NAME_LENGTH_AT + 2]
                    .try_into()
                    .unwrap(),
            ));
            let at = if self.flags & FILE_HAS_LARGE_SIZES == 0 {
                NAME_AT
            } else {
                NAME_AT + 8
            };
            &self.fields[at..at + length]
        }
    }

    fn crc32(bytes: &[u8]) -> u32 {
        let mut crc = flate2::Crc::new();
        crc.update(bytes);
        crc.sum()
    }

    fn blocks(archive: &[u8]) -> Vec<Block> {
        assert_eq!(&archive[..SIGNATURE.len()], SIGNATURE);
        let mut rest = &archive[SIGNATURE.len()..];
        let mut blocks = Vec::new();
        while !rest.is_empty() {
            let crc = u16::from_le_bytes(rest[..2].try_into().unwrap());
            let size = usize::from(u16::from_le_bytes(rest[5..7].try_into().unwrap()));
            assert_eq!(u32::from(crc), crc32(&rest[2..size]) & 0xFFFF);
            let mut block = Block {
                kind: rest[2],
                flags: u16::from_le_bytes(rest[3..5].try_into().unwrap()),
                fields: rest[BLOCK_PREFIX_LENGTH..size].to_vec(),
                data: Vec::new(),
            };
            let data_length = if block.kind == FILE {
                usize::try_from(block.u32_at(0)).unwrap()
            } else {
                0
            };
            block.data = rest[size..size + data_length].to_vec();
            rest = &rest[size + data_length..];
            blocks.push(block);
        }
        blocks
    }

    fn entry(name: &str, bytes: &[u8]) -> ArchiveEntry {
        ArchiveEntry {
            name: name.to_owned(),
            bytes: bytes.to_vec(),
        }
    }

    fn pages() -> Vec<ArchiveEntry> {
        vec![entry("2.png", b"second"), entry("1.png", b"first page")]
    }

    fn files(blocks: &[Block]) -> Vec<&Block> {
        blocks.iter().filter(|block| block.kind == FILE).collect()
    }

    #[test]
    fn writes_blocks_whose_crc16_is_the_low_half_of_their_crc32() {
        let archive = cbr(&pages(), &RarOptions::of(RarFormat::RAR4)).unwrap();

        let kinds: Vec<u8> = blocks(&archive).iter().map(|block| block.kind).collect();

        assert_eq!(kinds, [MAIN, FILE, FILE, END]);
    }

    #[test]
    fn stores_each_entry_in_the_given_order_with_its_size_crc32_and_version() {
        let archive = cbr(&pages(), &RarOptions::of(RarFormat::RAR4)).unwrap();

        let blocks = blocks(&archive);

        let stored: Vec<StoredFile<'_>> = files(&blocks)
            .iter()
            .map(|file| {
                (
                    file.name(),
                    file.data.as_slice(),
                    file.u32_at(4),
                    file.u32_at(9),
                    file.fields[17],
                )
            })
            .collect();
        assert_eq!(
            stored,
            [
                (&b"2.png"[..], &b"second"[..], 6, crc32(b"second"), 29),
                (
                    &b"1.png"[..],
                    &b"first page"[..],
                    10,
                    crc32(b"first page"),
                    29
                ),
            ]
        );
    }

    #[test]
    fn writes_folders_with_backslashes_and_the_directory_flag() {
        let entries = [entry("chapter/", b""), entry("chapter/1.png", b"page")];

        let blocks = blocks(&cbr(&entries, &RarOptions::of(RarFormat::RAR4)).unwrap());

        let files = files(&blocks);
        assert_eq!(
            (
                files[0].flags & FILE_IS_DIRECTORY,
                files[0].name(),
                files[1].name()
            ),
            (FILE_IS_DIRECTORY, &b"chapter"[..], &b"chapter\\1.png"[..])
        );
    }

    #[test]
    fn writes_a_name_outside_ascii_as_utf8_with_the_unicode_flag() {
        let entries = [entry("página.png", b"page")];

        let blocks = blocks(&cbr(&entries, &RarOptions::of(RarFormat::RAR4)).unwrap());

        let file = files(&blocks)[0];
        assert_eq!(
            (file.flags & FILE_HAS_UNICODE_NAME, file.name()),
            (FILE_HAS_UNICODE_NAME, "página.png".as_bytes())
        );
    }

    #[test]
    fn marks_the_archive_and_every_file_after_the_first_solid() {
        let options = RarOptions {
            packing: Packing::Solid,
            ..RarOptions::of(RarFormat::RAR4)
        };

        let blocks = blocks(&cbr(&pages(), &options).unwrap());

        let solid: Vec<u16> = files(&blocks)
            .iter()
            .map(|file| file.flags & FILE_IS_SOLID)
            .collect();
        assert_eq!(
            (blocks[0].flags & MAIN_IS_SOLID, solid),
            (MAIN_IS_SOLID, vec![0, FILE_IS_SOLID])
        );
    }

    #[test]
    fn writes_the_unpack_version_and_method_it_is_given() {
        let options = RarOptions {
            format: RarFormat::Rar4 { unpack_version: 20 },
            method: RarMethod::DeclaredCompressed,
            ..RarOptions::of(RarFormat::RAR4)
        };

        let blocks = blocks(&cbr(&pages(), &options).unwrap());

        let file = files(&blocks)[0];
        assert_eq!((file.fields[17], file.fields[18]), (20, 0x33));
    }

    #[test]
    fn splits_a_declared_size_past_four_gib_into_high_and_low_halves() {
        let options = RarOptions {
            declared_unpacked_size: Some((7 << 32) | 5),
            ..RarOptions::of(RarFormat::RAR4)
        };

        let blocks = blocks(&cbr(&pages(), &options).unwrap());

        let file = files(&blocks)[0];
        assert_eq!(
            (
                file.flags & FILE_HAS_LARGE_SIZES,
                file.u32_at(4),
                file.u32_at(25),
                file.u32_at(29),
                file.data.len()
            ),
            (FILE_HAS_LARGE_SIZES, 5, 0, 7, 6)
        );
    }

    #[test]
    fn marks_encrypted_headers_on_the_main_block_and_encrypted_entries_on_each_file() {
        let headers = RarOptions {
            encryption: RarEncryption::Headers,
            ..RarOptions::of(RarFormat::RAR4)
        };
        let entries = RarOptions {
            encryption: RarEncryption::Entries,
            ..RarOptions::of(RarFormat::RAR4)
        };

        let main = blocks(&cbr(&pages(), &headers).unwrap())[0].flags;
        let files_flags: Vec<u16> = files(&blocks(&cbr(&pages(), &entries).unwrap()))
            .iter()
            .map(|file| file.flags & FILE_IS_ENCRYPTED)
            .collect();

        assert_eq!(
            (main & MAIN_IS_ENCRYPTED, files_flags),
            (MAIN_IS_ENCRYPTED, vec![FILE_IS_ENCRYPTED; 2])
        );
    }

    #[test]
    fn marks_a_volume_and_a_last_entry_continuing_in_the_next_one() {
        let part_of_set = RarOptions {
            volume: RarVolume::PartOfSet,
            ..RarOptions::of(RarFormat::RAR4)
        };
        let continues = RarOptions {
            volume: RarVolume::LastEntryContinues,
            ..RarOptions::of(RarFormat::RAR4)
        };

        let main = blocks(&cbr(&pages(), &part_of_set).unwrap())[0].flags;
        let continuing: Vec<u16> = files(&blocks(&cbr(&pages(), &continues).unwrap()))
            .iter()
            .map(|file| file.flags & FILE_CONTINUES)
            .collect();

        assert_eq!(
            (main & MAIN_IS_VOLUME, continuing),
            (MAIN_IS_VOLUME, vec![0, FILE_CONTINUES])
        );
    }
}
