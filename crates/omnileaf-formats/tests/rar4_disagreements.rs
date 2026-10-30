#![expect(
    clippy::unwrap_used,
    reason = "the archives are built in memory, so a failed set-up should stop the test"
)]

use std::{io::Cursor, path::Path};

use omnileaf_formats::{FormatError, Limits, RarListing};

const SIGNATURE: &[u8] = b"Rar!\x1a\x07\x00";
const MAIN: u8 = 0x73;
const FILE: u8 = 0x74;
const SERVICE: u8 = 0x7A;
const END: u8 = 0x7B;
const NO_FLAGS: u16 = 0;
const HAS_ADDED_SIZE: u16 = 0x8000;
const MORE_VOLUMES_FOLLOW: u16 = 0x0001;
const DICTIONARY_BITS_ALL_SET: u16 = 0x00E0;
const HAS_UNICODE_NAME: u16 = 0x0200;
const WINDOWS: u8 = 2;
const UNIX: u8 = 3;
const UNKNOWN_HOST: u8 = 9;
const ARCHIVE_ATTRIBUTE: u32 = 0x20;
const DIRECTORY_ATTRIBUTE: u32 = 0x10;
const UNIX_REGULAR: u32 = 0o100_644;
const UNIX_DIRECTORY: u32 = 0o040_755;
const UNIX_SYMLINK: u32 = 0o120_777;
const RAR3: u8 = 29;
const STORED: u8 = 0x30;
const BEST: u8 = 0x35;
const PAGE: &[u8] = b"PAGE";

fn crc32(bytes: &[u8]) -> u32 {
    let mut crc = flate2::Crc::new();
    crc.update(bytes);
    crc.sum()
}

fn block_with_crc_over(kind: u8, flags: u16, fields: &[u8], also_checked: &[u8]) -> Vec<u8> {
    let size = u16::try_from(7 + fields.len()).unwrap();
    let head = [
        &[kind][..],
        &flags.to_le_bytes(),
        &size.to_le_bytes(),
        fields,
    ]
    .concat();
    let crc16 = u16::try_from(crc32(&[&head[..], also_checked].concat()) & 0xFFFF).unwrap();
    [&crc16.to_le_bytes()[..], &head].concat()
}

fn block(kind: u8, flags: u16, fields: &[u8]) -> Vec<u8> {
    block_with_crc_over(kind, flags, fields, b"")
}

#[derive(Clone)]
struct Entry<'a> {
    kind: u8,
    flags: u16,
    host: u8,
    attributes: u32,
    unpacked: Option<u32>,
    method: u8,
    name: &'a [u8],
    data: &'a [u8],
}

impl<'a> Entry<'a> {
    fn page(name: &'a [u8]) -> Self {
        Self {
            kind: FILE,
            flags: HAS_ADDED_SIZE,
            host: WINDOWS,
            attributes: ARCHIVE_ATTRIBUTE,
            unpacked: None,
            method: STORED,
            name,
            data: PAGE,
        }
    }

    fn bytes(&self) -> Vec<u8> {
        let packed = u32::try_from(self.data.len()).unwrap();
        let fields = [
            &packed.to_le_bytes()[..],
            &self.unpacked.unwrap_or(packed).to_le_bytes(),
            &[self.host],
            &crc32(self.data).to_le_bytes(),
            &[0; 4],
            &[RAR3, self.method],
            &u16::try_from(self.name.len()).unwrap().to_le_bytes(),
            &self.attributes.to_le_bytes(),
            self.name,
        ]
        .concat();
        [block(self.kind, self.flags, &fields), self.data.to_vec()].concat()
    }
}

fn main_block() -> Vec<u8> {
    block(MAIN, NO_FLAGS, &[0; 6])
}

fn end_block() -> Vec<u8> {
    block(END, NO_FLAGS, b"")
}

fn archive(parts: &[Vec<u8>]) -> Vec<u8> {
    [
        SIGNATURE.to_vec(),
        main_block(),
        parts.concat(),
        end_block(),
    ]
    .concat()
}

fn listing(bytes: &[u8]) -> Result<RarListing, FormatError> {
    RarListing::read(
        &mut Cursor::new(bytes),
        Path::new("book.cbr"),
        &Limits::default(),
    )
}

fn entry_names(bytes: &[u8]) -> Vec<String> {
    listing(bytes)
        .unwrap()
        .entries
        .into_iter()
        .map(|entry| entry.name)
        .collect()
}

#[test]
fn lists_the_entries_the_raw_builder_writes() {
    let bytes = archive(&[Entry::page(b"1.png").bytes(), Entry::page(b"2.png").bytes()]);

    assert_eq!(entry_names(&bytes), ["1.png", "2.png"]);
}

#[test]
fn refuses_a_file_named_like_the_file_before_it() {
    let bytes = archive(&[Entry::page(b"1.png").bytes(), Entry::page(b"1.png").bytes()]);

    let error = listing(&bytes).unwrap_err();

    assert!(matches!(error, FormatError::CorruptRar { .. }), "{error:?}");
}

#[test]
fn refuses_a_file_named_like_the_file_before_a_service_block() {
    let service = Entry {
        kind: SERVICE,
        ..Entry::page(b"CMT")
    };
    let bytes = archive(&[
        Entry::page(b"1.png").bytes(),
        service.bytes(),
        Entry::page(b"1.png").bytes(),
    ]);

    let error = listing(&bytes).unwrap_err();

    assert!(matches!(error, FormatError::CorruptRar { .. }), "{error:?}");
}

#[test]
fn takes_an_entry_s_type_from_its_windows_attributes_rather_than_its_dictionary_bits() {
    let declared_folder = Entry {
        flags: HAS_ADDED_SIZE | DICTIONARY_BITS_ALL_SET,
        unpacked: Some(0xFFFF_FFF0),
        method: BEST,
        ..Entry::page(b"ComicInfo.xml")
    };
    let bytes = archive(&[declared_folder.bytes(), Entry::page(b"1.png").bytes()]);

    let error = listing(&bytes).unwrap_err();

    assert!(
        matches!(error, FormatError::SuspiciousCompression { .. }),
        "{error:?}"
    );
}

#[test]
fn lists_a_windows_folder_by_its_attribute() {
    let folder = Entry {
        attributes: DIRECTORY_ATTRIBUTE,
        data: b"",
        ..Entry::page(b"chapter")
    };
    let bytes = archive(&[folder.bytes(), Entry::page(b"chapter\\1.png").bytes()]);

    assert_eq!(entry_names(&bytes), ["chapter/1.png"]);
}

#[test]
fn lists_a_unix_regular_file() {
    let page = Entry {
        host: UNIX,
        attributes: UNIX_REGULAR,
        ..Entry::page(b"1.png")
    };

    assert_eq!(entry_names(&archive(&[page.bytes()])), ["1.png"]);
}

#[test]
fn refuses_a_unix_symbolic_link() {
    let link = Entry {
        host: UNIX,
        attributes: UNIX_SYMLINK,
        ..Entry::page(b"1.png")
    };

    let error = listing(&archive(&[link.bytes()])).unwrap_err();

    assert!(
        matches!(error, FormatError::UnsupportedEntry { .. }),
        "{error:?}"
    );
}

#[test]
fn refuses_a_unix_folder_carrying_data() {
    let folder = Entry {
        host: UNIX,
        attributes: UNIX_DIRECTORY,
        ..Entry::page(b"1.png")
    };

    let error = listing(&archive(&[folder.bytes()])).unwrap_err();

    assert!(matches!(error, FormatError::CorruptRar { .. }), "{error:?}");
}

#[test]
fn refuses_an_entry_from_an_unknown_host() {
    let entry = Entry {
        host: UNKNOWN_HOST,
        ..Entry::page(b"1.png")
    };

    let error = listing(&archive(&[entry.bytes()])).unwrap_err();

    assert!(matches!(error, FormatError::CorruptRar { .. }), "{error:?}");
}

#[test]
fn checks_an_end_block_s_crc_over_the_data_it_adds() {
    let added = b"tail";
    let added_size = u32::try_from(added.len()).unwrap().to_le_bytes();
    let end = block_with_crc_over(END, HAS_ADDED_SIZE, &added_size, added);
    let bytes = [
        SIGNATURE.to_vec(),
        main_block(),
        Entry::page(b"1.png").bytes(),
        end,
        added.to_vec(),
    ]
    .concat();

    assert_eq!(entry_names(&bytes), ["1.png"]);
}

#[test]
fn refuses_an_end_block_announcing_another_volume() {
    let bytes = [
        SIGNATURE.to_vec(),
        main_block(),
        Entry::page(b"1.png").bytes(),
        block(END, MORE_VOLUMES_FOLLOW, b""),
    ]
    .concat();

    let error = listing(&bytes).unwrap_err();

    assert!(
        matches!(error, FormatError::MultiVolume { .. }),
        "{error:?}"
    );
}

#[test]
fn refuses_a_name_holding_a_nul() {
    let error = listing(&archive(&[Entry::page(b"1\0.png").bytes()])).unwrap_err();

    assert!(matches!(error, FormatError::CorruptRar { .. }), "{error:?}");
}

#[test]
fn refuses_a_wide_name_decoding_to_a_nul() {
    let high_byte = 0;
    let four_low_bytes = 0b00_00_00_00;
    let name = [
        &b"a?b.png"[..],
        &[0, high_byte, four_low_bytes, b'a', 0, b'b', b'.'],
    ]
    .concat();
    let entry = Entry {
        flags: HAS_ADDED_SIZE | HAS_UNICODE_NAME,
        ..Entry::page(&name)
    };

    let error = listing(&archive(&[entry.bytes()])).unwrap_err();

    assert!(matches!(error, FormatError::CorruptRar { .. }), "{error:?}");
}

#[test]
fn refuses_an_empty_name() {
    let error = listing(&archive(&[Entry::page(b"").bytes()])).unwrap_err();

    assert!(matches!(error, FormatError::CorruptRar { .. }), "{error:?}");
}

#[test]
fn lists_codepage_names_that_differ_only_outside_ascii() {
    let bytes = archive(&[
        Entry::page(b"\x8e\xa1.jpg").bytes(),
        Entry::page(b"\x8e\xa2.jpg").bytes(),
    ]);

    let entries = listing(&bytes).unwrap().entries;

    assert_eq!(entries.len(), 2);
}
