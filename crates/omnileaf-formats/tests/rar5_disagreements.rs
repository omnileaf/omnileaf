#![expect(
    clippy::unwrap_used,
    reason = "the archives are built in memory, so a failed set-up should stop the test"
)]

use std::{io::Cursor, path::Path};

use omnileaf_formats::{FormatError, Limits, RarListing};

const SIGNATURE: &[u8] = b"Rar!\x1a\x07\x01\x00";
const MARK: u64 = 0;
const MAIN: u64 = 1;
const FILE: u64 = 2;
const SERVICE: u64 = 3;
const ENCRYPTION: u64 = 4;
const END: u64 = 5;
const UNKNOWN: u64 = 6;
const NO_FLAGS: u64 = 0;
const HAS_EXTRA: u64 = 0x0001;
const HAS_DATA: u64 = 0x0002;
const SKIP_IF_UNKNOWN: u64 = 0x0004;
const DIRECTORY: u64 = 0x0001;
const UNKNOWN_UNPACKED_SIZE: u64 = 0x0008;
const WINDOWS: u64 = 0;
const UNIX: u64 = 1;
const UNKNOWN_HOST: u64 = 7;
const ARCHIVE_ATTRIBUTE: u64 = 0x20;
const DIRECTORY_ATTRIBUTE: u64 = 0x10;
const UNIX_REGULAR: u64 = 0o100_644;
const UNIX_DIRECTORY: u64 = 0o040_755;
const UNIX_SYMLINK: u64 = 0o120_777;
const NORMAL_IN_128_MIB: u64 = (3 << 7) | (10 << 10);
const ENCRYPTION_RECORD: u64 = 0x01;
const HASH_RECORD: u64 = 0x02;
const TIME_RECORD: u64 = 0x03;
const VERSION_RECORD: u64 = 0x04;
const REDIRECTION_RECORD: u64 = 0x05;
const OWNER_RECORD: u64 = 0x06;
const BLAKE2SP: u8 = 0x00;
const UNIX_TIME_WITH_MTIME: u8 = 0x03;
const WINDOWS_TIME_WITH_MTIME: u8 = 0x02;
const OWNER_USER_NAME_AND_UID: u8 = 0x05;
const SYMLINK: u8 = 0x01;
const PAGE: &[u8] = b"PAGE";

fn vint(mut value: u64) -> Vec<u8> {
    let mut bytes = Vec::new();
    loop {
        let low = u8::try_from(value & 0x7F).unwrap();
        value >>= 7;
        if value == 0 {
            bytes.push(low);
            return bytes;
        }
        bytes.push(low | 0x80);
    }
}

fn block(body: &[u8]) -> Vec<u8> {
    let checked = [vint(body.len() as u64), body.to_vec()].concat();
    let mut crc = flate2::Crc::new();
    crc.update(&checked);
    [crc.sum().to_le_bytes().to_vec(), checked].concat()
}

fn simple(kind: u64, flags: u64, fields: &[u8]) -> Vec<u8> {
    block(&[vint(kind), vint(flags), fields.to_vec()].concat())
}

fn record(kind: u64, fields: &[u8]) -> Vec<u8> {
    let typed = [vint(kind), fields.to_vec()].concat();
    [vint(typed.len() as u64), typed].concat()
}

#[derive(Clone)]
struct Entry<'a> {
    kind: u64,
    file_flags: u64,
    unpacked: u64,
    attributes: u64,
    compression: u64,
    host: u64,
    name: &'a [u8],
    slack: &'a [u8],
    extra: Vec<u8>,
    data: Option<&'a [u8]>,
}

impl<'a> Entry<'a> {
    fn page(name: &'a [u8]) -> Self {
        Self {
            kind: FILE,
            file_flags: NO_FLAGS,
            unpacked: PAGE.len() as u64,
            attributes: ARCHIVE_ATTRIBUTE,
            compression: 0,
            host: WINDOWS,
            name,
            slack: b"",
            extra: Vec::new(),
            data: Some(PAGE),
        }
    }

    fn bytes(&self) -> Vec<u8> {
        let mut flags = NO_FLAGS;
        let mut sizes = Vec::new();
        if !self.extra.is_empty() {
            flags |= HAS_EXTRA;
            sizes.extend(vint(self.extra.len() as u64));
        }
        if let Some(data) = self.data {
            flags |= HAS_DATA;
            sizes.extend(vint(data.len() as u64));
        }
        let body = [
            vint(self.kind),
            vint(flags),
            sizes,
            vint(self.file_flags),
            vint(self.unpacked),
            vint(self.attributes),
            vint(self.compression),
            vint(self.host),
            vint(self.name.len() as u64),
            self.name.to_vec(),
            self.slack.to_vec(),
            self.extra.clone(),
        ]
        .concat();
        [block(&body), self.data.unwrap_or_default().to_vec()].concat()
    }
}

fn archive(parts: &[Vec<u8>]) -> Vec<u8> {
    [
        SIGNATURE.to_vec(),
        simple(MAIN, NO_FLAGS, &vint(NO_FLAGS)),
        parts.concat(),
        simple(END, NO_FLAGS, &vint(NO_FLAGS)),
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

fn page_names(bytes: &[u8]) -> Vec<String> {
    listing(bytes)
        .unwrap()
        .pages
        .into_iter()
        .map(|page| page.name)
        .collect()
}

fn hidden_page() -> Vec<u8> {
    Entry::page(b"hidden.png").bytes()
}

#[test]
fn lists_the_pages_the_raw_builder_writes() {
    let bytes = archive(&[Entry::page(b"1.png").bytes(), Entry::page(b"2.png").bytes()]);

    assert_eq!(page_names(&bytes), ["1.png", "2.png"]);
}

#[test]
fn refuses_slack_after_a_file_name() {
    let slacking = Entry {
        slack: &[0; 8],
        ..Entry::page(b"1.png")
    };

    let error = listing(&archive(&[slacking.bytes()])).unwrap_err();

    assert!(matches!(error, FormatError::CorruptRar { .. }), "{error:?}");
}

#[test]
fn refuses_slack_after_a_service_name() {
    let slacking = Entry {
        kind: SERVICE,
        slack: &[0; 8],
        ..Entry::page(b"CMT")
    };

    let error = listing(&archive(&[slacking.bytes()])).unwrap_err();

    assert!(matches!(error, FormatError::CorruptRar { .. }), "{error:?}");
}

#[test]
fn refuses_an_extra_record_declaring_more_bytes_than_its_fields_hold() {
    let padded_time = [&[UNIX_TIME_WITH_MTIME][..], &[0; 4], &[0; 2]].concat();
    let entry = Entry {
        extra: record(TIME_RECORD, &padded_time),
        ..Entry::page(b"1.png")
    };

    let error = listing(&archive(&[entry.bytes()])).unwrap_err();

    assert!(matches!(error, FormatError::CorruptRar { .. }), "{error:?}");
}

#[test]
fn refuses_an_extra_record_declaring_fewer_bytes_than_its_fields_need() {
    let short_time = [&[WINDOWS_TIME_WITH_MTIME][..], &[0; 4]].concat();
    let entry = Entry {
        extra: record(TIME_RECORD, &short_time),
        ..Entry::page(b"1.png")
    };

    let error = listing(&archive(&[entry.bytes()])).unwrap_err();

    assert!(matches!(error, FormatError::CorruptRar { .. }), "{error:?}");
}

#[test]
fn refuses_a_hash_record_of_an_unknown_hash_type() {
    let unknown_hash = [&[BLAKE2SP + 1][..], &[0; 32]].concat();
    let entry = Entry {
        extra: record(HASH_RECORD, &unknown_hash),
        ..Entry::page(b"1.png")
    };

    let error = listing(&archive(&[entry.bytes()])).unwrap_err();

    assert!(matches!(error, FormatError::CorruptRar { .. }), "{error:?}");
}

#[test]
fn lists_an_entry_with_well_formed_time_hash_and_owner_records() {
    let records = [
        record(
            TIME_RECORD,
            &[&[UNIX_TIME_WITH_MTIME][..], &[0; 4]].concat(),
        ),
        record(HASH_RECORD, &[&[BLAKE2SP][..], &[0; 32]].concat()),
        record(
            OWNER_RECORD,
            &[
                &[OWNER_USER_NAME_AND_UID][..],
                &vint(4),
                b"user",
                &vint(1000),
            ]
            .concat(),
        ),
    ]
    .concat();
    let entry = Entry {
        extra: records,
        ..Entry::page(b"1.png")
    };

    let names = page_names(&archive(&[entry.bytes()]));

    assert_eq!(names, ["1.png"]);
}

#[test]
fn refuses_an_entry_redirected_to_another() {
    let link = [&[SYMLINK, 0][..], &vint(5), b"2.png"].concat();
    let entry = Entry {
        extra: record(REDIRECTION_RECORD, &link),
        ..Entry::page(b"1.png")
    };

    let error = listing(&archive(&[entry.bytes()])).unwrap_err();

    assert!(
        matches!(error, FormatError::UnsupportedEntry { .. }),
        "{error:?}"
    );
}

#[test]
fn refuses_an_encrypted_service_header() {
    let encrypted = [&vint(0)[..], &vint(0), &[15], &[0; 32]].concat();
    let service = Entry {
        kind: SERVICE,
        extra: record(ENCRYPTION_RECORD, &encrypted),
        ..Entry::page(b"CMT")
    };

    let error = listing(&archive(&[service.bytes()])).unwrap_err();

    assert!(matches!(error, FormatError::Encrypted { .. }), "{error:?}");
}

#[test]
fn refuses_a_main_header_carrying_data() {
    let hidden = hidden_page();
    let main_with_data = simple(
        MAIN,
        HAS_DATA,
        &[vint(hidden.len() as u64), vint(NO_FLAGS)].concat(),
    );
    let bytes = [
        SIGNATURE.to_vec(),
        main_with_data,
        hidden,
        Entry::page(b"1.png").bytes(),
        simple(END, NO_FLAGS, &vint(NO_FLAGS)),
    ]
    .concat();

    let error = listing(&bytes).unwrap_err();

    assert!(matches!(error, FormatError::CorruptRar { .. }), "{error:?}");
}

#[test]
fn refuses_an_end_header_carrying_data() {
    let hidden = hidden_page();
    let end_with_data = simple(
        END,
        HAS_DATA,
        &[vint(hidden.len() as u64), vint(NO_FLAGS)].concat(),
    );
    let bytes = [
        SIGNATURE.to_vec(),
        simple(MAIN, NO_FLAGS, &vint(NO_FLAGS)),
        Entry::page(b"1.png").bytes(),
        end_with_data,
        hidden,
    ]
    .concat();

    let error = listing(&bytes).unwrap_err();

    assert!(matches!(error, FormatError::CorruptRar { .. }), "{error:?}");
}

#[test]
fn refuses_an_unknown_header_carrying_data() {
    let hidden = hidden_page();
    let unknown = simple(
        UNKNOWN,
        SKIP_IF_UNKNOWN | HAS_DATA,
        &vint(hidden.len() as u64),
    );

    let error = listing(&archive(&[unknown, hidden])).unwrap_err();

    assert!(matches!(error, FormatError::CorruptRar { .. }), "{error:?}");
}

#[test]
fn refuses_an_unknown_header_not_marked_to_be_skipped() {
    let unknown = simple(UNKNOWN, NO_FLAGS, b"");

    let error = listing(&archive(&[unknown, Entry::page(b"1.png").bytes()])).unwrap_err();

    assert!(matches!(error, FormatError::CorruptRar { .. }), "{error:?}");
}

#[test]
fn lists_past_an_unknown_header_marked_to_be_skipped() {
    let unknown = simple(UNKNOWN, SKIP_IF_UNKNOWN, b"");

    let names = page_names(&archive(&[unknown, Entry::page(b"1.png").bytes()]));

    assert_eq!(names, ["1.png"]);
}

#[test]
fn refuses_a_header_of_the_mark_type() {
    let mark = simple(MARK, NO_FLAGS, b"");

    let error = listing(&archive(&[mark, Entry::page(b"1.png").bytes()])).unwrap_err();

    assert!(matches!(error, FormatError::CorruptRar { .. }), "{error:?}");
}

#[test]
fn refuses_a_service_header_needing_a_dictionary_above_the_cap() {
    let service = Entry {
        kind: SERVICE,
        compression: NORMAL_IN_128_MIB,
        ..Entry::page(b"CMT")
    };

    let error = listing(&archive(&[service.bytes()])).unwrap_err();

    assert!(
        matches!(error, FormatError::DictionaryTooLarge { .. }),
        "{error:?}"
    );
}

#[test]
fn counts_service_data_toward_the_total_limit() {
    let service = Entry {
        kind: SERVICE,
        unpacked: 1 << 43,
        ..Entry::page(b"CMT")
    };

    let error = listing(&archive(&[service.bytes()])).unwrap_err();

    assert!(
        matches!(error, FormatError::TooLargeInTotal { .. }),
        "{error:?}"
    );
}

#[test]
fn refuses_an_entry_of_unknown_unpacked_size() {
    let entry = Entry {
        file_flags: UNKNOWN_UNPACKED_SIZE,
        ..Entry::page(b"1.png")
    };

    let error = listing(&archive(&[entry.bytes()])).unwrap_err();

    assert!(matches!(error, FormatError::CorruptRar { .. }), "{error:?}");
}

#[test]
fn refuses_a_file_whose_windows_attributes_say_folder() {
    let entry = Entry {
        attributes: DIRECTORY_ATTRIBUTE,
        ..Entry::page(b"1.png")
    };

    let error = listing(&archive(&[entry.bytes()])).unwrap_err();

    assert!(matches!(error, FormatError::CorruptRar { .. }), "{error:?}");
}

#[test]
fn lists_a_unix_regular_file() {
    let entry = Entry {
        host: UNIX,
        attributes: UNIX_REGULAR,
        ..Entry::page(b"1.png")
    };

    let names = page_names(&archive(&[entry.bytes()]));

    assert_eq!(names, ["1.png"]);
}

#[test]
fn refuses_a_file_whose_unix_mode_says_folder() {
    let entry = Entry {
        host: UNIX,
        attributes: UNIX_DIRECTORY,
        ..Entry::page(b"1.png")
    };

    let error = listing(&archive(&[entry.bytes()])).unwrap_err();

    assert!(matches!(error, FormatError::CorruptRar { .. }), "{error:?}");
}

#[test]
fn refuses_a_unix_symbolic_link() {
    let entry = Entry {
        host: UNIX,
        attributes: UNIX_SYMLINK,
        ..Entry::page(b"1.png")
    };

    let error = listing(&archive(&[entry.bytes()])).unwrap_err();

    assert!(
        matches!(error, FormatError::UnsupportedEntry { .. }),
        "{error:?}"
    );
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
fn refuses_a_folder_carrying_data() {
    let folder = Entry {
        file_flags: DIRECTORY,
        attributes: DIRECTORY_ATTRIBUTE,
        ..Entry::page(b"chapter")
    };

    let error = listing(&archive(&[folder.bytes()])).unwrap_err();

    assert!(matches!(error, FormatError::CorruptRar { .. }), "{error:?}");
}

#[test]
fn refuses_a_file_without_a_data_area() {
    let entry = Entry {
        data: None,
        ..Entry::page(b"1.png")
    };

    let error = listing(&archive(&[entry.bytes()])).unwrap_err();

    assert!(matches!(error, FormatError::CorruptRar { .. }), "{error:?}");
}

#[test]
fn refuses_a_name_holding_a_nul() {
    let error = listing(&archive(&[Entry::page(b"1\0.png").bytes()])).unwrap_err();

    assert!(matches!(error, FormatError::CorruptRar { .. }), "{error:?}");
}

#[test]
fn refuses_an_empty_name() {
    let error = listing(&archive(&[Entry::page(b"").bytes()])).unwrap_err();

    assert!(matches!(error, FormatError::CorruptRar { .. }), "{error:?}");
}

#[test]
fn refuses_an_entry_carrying_a_version_record() {
    let version = [vint(NO_FLAGS), vint(2)].concat();
    let entry = Entry {
        extra: record(VERSION_RECORD, &version),
        ..Entry::page(b"1.png")
    };

    let error = listing(&archive(&[entry.bytes()])).unwrap_err();

    assert!(
        matches!(error, FormatError::UnsupportedEntry { .. }),
        "{error:?}"
    );
}

#[test]
fn reports_an_encryption_header_carrying_data_as_encrypted() {
    let aes_256_with_salt = [&vint(0)[..], &vint(NO_FLAGS), &[15], &[0; 16]].concat();
    let encryption = simple(ENCRYPTION, HAS_DATA, &[vint(0), aes_256_with_salt].concat());
    let bytes = [SIGNATURE.to_vec(), encryption].concat();

    let error = listing(&bytes).unwrap_err();

    assert!(matches!(error, FormatError::Encrypted { .. }), "{error:?}");
}
