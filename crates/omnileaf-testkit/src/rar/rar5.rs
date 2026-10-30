use super::{
    Member, RarEncryption, RarMethod, RarOptions, RarVolume, SMALLEST_RAR5_DICTIONARY_BYTES, crc32,
};
use crate::Packing;

const SIGNATURE: &[u8] = b"Rar!\x1a\x07\x01\x00";
const MAIN: u64 = 1;
const FILE: u64 = 2;
const ENCRYPTION: u64 = 4;
const END: u64 = 5;
const NO_FLAGS: u64 = 0;
const HAS_EXTRA: u64 = 0x0001;
const HAS_DATA: u64 = 0x0002;
const CONTINUES_IN_NEXT_VOLUME: u64 = 0x0010;
const ARCHIVE_IS_VOLUME: u64 = 0x0001;
const ARCHIVE_IS_SOLID: u64 = 0x0004;
const FILE_IS_DIRECTORY: u64 = 0x0001;
const FILE_HAS_CRC32: u64 = 0x0004;
const SOLID: u64 = 0x0040;
const METHOD_SHIFT: u32 = 7;
const DICTIONARY_SHIFT: u32 = 10;
const STORED: u64 = 0;
const NORMAL: u64 = 3;
const HOST_WINDOWS: u64 = 0;
const ATTRIBUTE_ARCHIVE: u64 = 0x20;
const ATTRIBUTE_DIRECTORY: u64 = 0x10;
const ENCRYPTION_RECORD: u64 = 0x01;
const AES_256: u64 = 0;
const KDF_COUNT: u8 = 15;
const SALT: [u8; 16] = [0; 16];
const INITIALIZATION_VECTOR: [u8; 16] = [0; 16];
const VINT_DATA_BITS: u32 = 7;
const VINT_DATA_MASK: u64 = 0x7F;
const VINT_CONTINUES: u8 = 0x80;

#[derive(Clone, Copy, Debug)]
pub(super) struct Compression {
    pub(super) version: u8,
    pub(super) dictionary_bytes: u64,
}

struct Block<'a> {
    kind: u64,
    flags: u64,
    fields: Vec<u8>,
    extra: Vec<u8>,
    data: Option<&'a [u8]>,
}

pub(super) fn archive(
    members: &[Member<'_>],
    options: &RarOptions,
    compression: Compression,
) -> Vec<u8> {
    let mut archive = SIGNATURE.to_vec();
    if options.encryption == RarEncryption::Headers {
        archive.extend(encryption_block().encode());
    }
    archive.extend(main_block(options).encode());
    for member in members {
        archive.extend(file_block(member, options, compression).encode());
    }
    archive.extend(simple_block(END, &vint(NO_FLAGS)).encode());
    archive
}

fn simple_block<'a>(kind: u64, fields: &[u8]) -> Block<'a> {
    Block {
        kind,
        flags: NO_FLAGS,
        fields: fields.to_vec(),
        extra: Vec::new(),
        data: None,
    }
}

fn encryption_block<'a>() -> Block<'a> {
    let fields = [&vint(AES_256)[..], &vint(NO_FLAGS), &[KDF_COUNT], &SALT].concat();
    simple_block(ENCRYPTION, &fields)
}

fn main_block<'a>(options: &RarOptions) -> Block<'a> {
    let mut archive_flags = NO_FLAGS;
    if options.volume == RarVolume::PartOfSet {
        archive_flags |= ARCHIVE_IS_VOLUME;
    }
    if options.packing == Packing::Solid {
        archive_flags |= ARCHIVE_IS_SOLID;
    }
    simple_block(MAIN, &vint(archive_flags))
}

fn file_block<'a>(
    member: &Member<'a>,
    options: &RarOptions,
    compression: Compression,
) -> Block<'a> {
    let (file_flags, attributes, information, data) = if member.is_directory {
        (FILE_IS_DIRECTORY, ATTRIBUTE_DIRECTORY, 0, None)
    } else {
        (
            FILE_HAS_CRC32,
            ATTRIBUTE_ARCHIVE,
            compression_information(member, options.method, compression),
            Some(member.bytes),
        )
    };
    let crc32 = if member.is_directory {
        Vec::new()
    } else {
        member.crc32.to_le_bytes().to_vec()
    };
    let fields = [
        &vint(file_flags)[..],
        &vint(member.unpacked_size),
        &vint(attributes),
        &crc32,
        &vint(information),
        &vint(HOST_WINDOWS),
        &vint(member.name.len() as u64),
        member.name.as_bytes(),
    ]
    .concat();
    let extra = if options.encryption == RarEncryption::Entries && !member.is_directory {
        record(ENCRYPTION_RECORD, &encryption_record())
    } else {
        Vec::new()
    };
    let flags = if member.continues {
        CONTINUES_IN_NEXT_VOLUME
    } else {
        NO_FLAGS
    };
    Block {
        kind: FILE,
        flags,
        fields,
        extra,
        data,
    }
}

fn compression_information(
    member: &Member<'_>,
    method: RarMethod,
    compression: Compression,
) -> u64 {
    let method = match method {
        RarMethod::Stored => STORED,
        RarMethod::DeclaredCompressed => NORMAL,
    };
    let dictionary = (compression.dictionary_bytes / SMALLEST_RAR5_DICTIONARY_BYTES)
        .checked_ilog2()
        .map_or(0, u64::from);
    let solid = if member.is_solid { SOLID } else { 0 };
    u64::from(compression.version)
        | solid
        | (method << METHOD_SHIFT)
        | (dictionary << DICTIONARY_SHIFT)
}

fn encryption_record() -> Vec<u8> {
    [
        &vint(AES_256)[..],
        &vint(NO_FLAGS),
        &[KDF_COUNT],
        &SALT,
        &INITIALIZATION_VECTOR,
    ]
    .concat()
}

fn record(kind: u64, data: &[u8]) -> Vec<u8> {
    let typed = [&vint(kind)[..], data].concat();
    [vint(typed.len() as u64), typed].concat()
}

impl Block<'_> {
    fn encode(&self) -> Vec<u8> {
        let mut flags = self.flags;
        let mut area_sizes = Vec::new();
        if !self.extra.is_empty() {
            flags |= HAS_EXTRA;
            area_sizes.extend(vint(self.extra.len() as u64));
        }
        if let Some(data) = self.data {
            flags |= HAS_DATA;
            area_sizes.extend(vint(data.len() as u64));
        }
        let body = [
            &vint(self.kind)[..],
            &vint(flags),
            &area_sizes,
            &self.fields,
            &self.extra,
        ]
        .concat();
        let checked = [vint(body.len() as u64), body].concat();
        [
            &crc32(&checked).to_le_bytes()[..],
            &checked,
            self.data.unwrap_or_default(),
        ]
        .concat()
    }
}

/// RAR5 stores integers as little-endian groups of seven bits, the top bit of each byte flagging that another follows.
fn vint(mut value: u64) -> Vec<u8> {
    let mut bytes = Vec::new();
    loop {
        let low = u8::try_from(value & VINT_DATA_MASK).unwrap_or_default();
        value >>= VINT_DATA_BITS;
        if value == 0 {
            bytes.push(low);
            return bytes;
        }
        bytes.push(low | VINT_CONTINUES);
    }
}

#[cfg(test)]
mod tests {
    use crate::{
        ArchiveEntry, Packing, RarEncryption, RarFormat, RarMethod, RarOptions, RarVolume, cbr,
    };

    const SIGNATURE: &[u8] = b"Rar!\x1a\x07\x01\x00";
    const MAIN: u64 = 1;
    const FILE: u64 = 2;
    const ENCRYPTION: u64 = 4;
    const END: u64 = 5;
    const HAS_EXTRA: u64 = 0x0001;
    const HAS_DATA: u64 = 0x0002;
    const CONTINUES_IN_NEXT_VOLUME: u64 = 0x0010;
    const ARCHIVE_IS_VOLUME: u64 = 0x0001;
    const ARCHIVE_IS_SOLID: u64 = 0x0004;
    const FILE_IS_DIRECTORY: u64 = 0x0001;
    const FILE_HAS_CRC32: u64 = 0x0004;
    const SOLID: u64 = 0x0040;
    const ENCRYPTION_RECORD: u64 = 0x01;

    struct Header {
        kind: u64,
        flags: u64,
        fields: Vec<u64>,
        name: String,
        extra: Vec<u8>,
        data: Vec<u8>,
    }

    struct Cursor<'a>(&'a [u8]);

    impl<'a> Cursor<'a> {
        fn take(&mut self, length: usize) -> &'a [u8] {
            let (taken, rest) = self.0.split_at(length);
            self.0 = rest;
            taken
        }

        fn vint(&mut self) -> u64 {
            let mut value = 0;
            for shift in (0..64).step_by(7) {
                let byte = self.take(1)[0];
                value |= u64::from(byte & 0x7F) << shift;
                if byte & 0x80 == 0 {
                    break;
                }
            }
            value
        }

        fn u32(&mut self) -> u32 {
            u32::from_le_bytes(self.take(4).try_into().unwrap())
        }
    }

    fn crc32(bytes: &[u8]) -> u32 {
        let mut crc = flate2::Crc::new();
        crc.update(bytes);
        crc.sum()
    }

    fn headers(archive: &[u8]) -> Vec<Header> {
        assert_eq!(&archive[..SIGNATURE.len()], SIGNATURE);
        let mut cursor = Cursor(&archive[SIGNATURE.len()..]);
        let mut headers = Vec::new();
        while !cursor.0.is_empty() {
            let crc = cursor.u32();
            let sized_start = cursor.0;
            let size = usize::try_from(cursor.vint()).unwrap();
            let size_length = sized_start.len() - cursor.0.len();
            let body = cursor.take(size);
            assert_eq!(crc, crc32(&sized_start[..size_length + size]));
            let mut header = Cursor(body);
            let kind = header.vint();
            let flags = header.vint();
            let extra_length = if flags & HAS_EXTRA == 0 {
                0
            } else {
                usize::try_from(header.vint()).unwrap()
            };
            let data_length = if flags & HAS_DATA == 0 {
                0
            } else {
                usize::try_from(header.vint()).unwrap()
            };
            let mut fields = Vec::new();
            let mut name = String::new();
            if kind == FILE {
                fields.extend([header.vint(), header.vint(), header.vint()]);
                let crc = if fields[0] & FILE_HAS_CRC32 == 0 {
                    0
                } else {
                    header.u32()
                };
                fields.push(u64::from(crc));
                fields.extend([header.vint(), header.vint()]);
                let name_length = usize::try_from(header.vint()).unwrap();
                name = String::from_utf8(header.take(name_length).to_vec()).unwrap();
            } else {
                while header.0.len() > extra_length {
                    fields.push(header.vint());
                }
            }
            let extra = header.take(extra_length).to_vec();
            assert!(header.0.is_empty());
            headers.push(Header {
                kind,
                flags,
                fields,
                name,
                extra,
                data: cursor.take(data_length).to_vec(),
            });
        }
        headers
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

    fn files(headers: &[Header]) -> Vec<&Header> {
        headers
            .iter()
            .filter(|header| header.kind == FILE)
            .collect()
    }

    #[test]
    fn writes_a_signature_then_main_file_and_end_headers_whose_crc32_match() {
        let archive = cbr(&pages(), &RarOptions::of(RarFormat::RAR5)).unwrap();

        let kinds: Vec<u64> = headers(&archive).iter().map(|header| header.kind).collect();

        assert_eq!(kinds, [MAIN, FILE, FILE, END]);
    }

    #[test]
    fn stores_each_entry_in_the_given_order_with_its_size_and_crc32() {
        let archive = cbr(&pages(), &RarOptions::of(RarFormat::RAR5)).unwrap();

        let headers = headers(&archive);

        let stored: Vec<(&str, &[u8], u64, u64)> = files(&headers)
            .iter()
            .map(|file| {
                (
                    file.name.as_str(),
                    file.data.as_slice(),
                    file.fields[1],
                    file.fields[3],
                )
            })
            .collect();
        assert_eq!(
            stored,
            [
                ("2.png", &b"second"[..], 6, u64::from(crc32(b"second"))),
                (
                    "1.png",
                    &b"first page"[..],
                    10,
                    u64::from(crc32(b"first page"))
                ),
            ]
        );
    }

    #[test]
    fn writes_a_folder_as_a_directory_without_data() {
        let entries = [entry("chapter/", b""), entry("chapter/1.png", b"page")];

        let archive = cbr(&entries, &RarOptions::of(RarFormat::RAR5)).unwrap();

        let headers = headers(&archive);
        let folder = files(&headers)[0];
        assert_eq!(
            (
                folder.name.as_str(),
                folder.fields[0] & FILE_IS_DIRECTORY,
                folder.flags & HAS_DATA
            ),
            ("chapter", FILE_IS_DIRECTORY, 0)
        );
    }

    #[test]
    fn marks_the_archive_and_every_file_after_the_first_solid() {
        let options = RarOptions {
            packing: Packing::Solid,
            ..RarOptions::of(RarFormat::RAR5)
        };

        let headers = headers(&cbr(&pages(), &options).unwrap());

        let solid: Vec<u64> = files(&headers)
            .iter()
            .map(|file| file.fields[4] & SOLID)
            .collect();
        assert_eq!(
            (headers[0].fields[0] & ARCHIVE_IS_SOLID, solid),
            (ARCHIVE_IS_SOLID, vec![0, SOLID])
        );
    }

    #[test]
    fn writes_the_compression_version_method_and_dictionary_it_is_given() {
        let options = RarOptions {
            format: RarFormat::Rar5 {
                compression_version: 1,
                dictionary_bytes: 128 * 1024 * 1024,
            },
            method: RarMethod::DeclaredCompressed,
            ..RarOptions::of(RarFormat::RAR5)
        };

        let headers = headers(&cbr(&pages(), &options).unwrap());

        let information = files(&headers)[0].fields[4];
        assert_eq!(
            (
                information & 0x3F,
                (information >> 7) & 0x7,
                (information >> 10) & 0x1F
            ),
            (1, 3, 10)
        );
    }

    #[test]
    fn declares_the_unpacked_size_it_is_given() {
        let options = RarOptions {
            declared_unpacked_size: Some(1 << 40),
            ..RarOptions::of(RarFormat::RAR5)
        };

        let headers = headers(&cbr(&pages(), &options).unwrap());

        let sizes: Vec<(u64, usize)> = files(&headers)
            .iter()
            .map(|file| (file.fields[1], file.data.len()))
            .collect();
        assert_eq!(sizes, [(1 << 40, 6), (1 << 40, 10)]);
    }

    #[test]
    fn puts_an_encryption_header_before_the_main_header() {
        let options = RarOptions {
            encryption: RarEncryption::Headers,
            ..RarOptions::of(RarFormat::RAR5)
        };

        let headers = headers(&cbr(&pages(), &options).unwrap());

        assert_eq!(
            headers
                .iter()
                .take(2)
                .map(|header| header.kind)
                .collect::<Vec<_>>(),
            [ENCRYPTION, MAIN]
        );
    }

    #[test]
    fn gives_every_encrypted_entry_an_encryption_record() {
        let options = RarOptions {
            encryption: RarEncryption::Entries,
            ..RarOptions::of(RarFormat::RAR5)
        };

        let headers = headers(&cbr(&pages(), &options).unwrap());

        let records: Vec<u64> = files(&headers)
            .iter()
            .map(|file| Cursor(&file.extra[1..]).vint())
            .collect();
        assert_eq!(records, [ENCRYPTION_RECORD, ENCRYPTION_RECORD]);
    }

    #[test]
    fn marks_a_volume_and_a_last_entry_continuing_in_the_next_one() {
        let part_of_set = RarOptions {
            volume: RarVolume::PartOfSet,
            ..RarOptions::of(RarFormat::RAR5)
        };
        let continues = RarOptions {
            volume: RarVolume::LastEntryContinues,
            ..RarOptions::of(RarFormat::RAR5)
        };

        let volume = headers(&cbr(&pages(), &part_of_set).unwrap());
        let split = headers(&cbr(&pages(), &continues).unwrap());

        let continuing: Vec<u64> = files(&split)
            .iter()
            .map(|file| file.flags & CONTINUES_IN_NEXT_VOLUME)
            .collect();
        assert_eq!(
            (volume[0].fields[0] & ARCHIVE_IS_VOLUME, continuing),
            (ARCHIVE_IS_VOLUME, vec![0, CONTINUES_IN_NEXT_VOLUME])
        );
    }

    #[test]
    fn refuses_a_folder_holding_bytes() {
        let entries = [entry("chapter/", b"bytes")];

        let error = cbr(&entries, &RarOptions::of(RarFormat::RAR5)).unwrap_err();

        assert!(
            matches!(&error, crate::FixtureError::RarFolderWithBytes { name } if name == "chapter/"),
            "{error:?}"
        );
    }
}
