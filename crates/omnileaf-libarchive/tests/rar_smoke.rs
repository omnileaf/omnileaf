#![expect(
    clippy::unwrap_used,
    reason = "the archives are built in memory, so a failed set-up should stop the test"
)]

use std::io::{self, Cursor, Read, Seek, SeekFrom};

use omnileaf_libarchive::{
    DEFAULT_LIMIT_BYTES, DESKTOP_DICTIONARY_CAP_BYTES, DESKTOP_LIMIT_BYTES, Entry, EntryKind,
    Error, MOBILE_DICTIONARY_CAP_BYTES, MOBILE_LIMIT_BYTES, Reader, version,
};
use omnileaf_testkit::{ArchiveEntry, RarFormat, RarMethod, RarOptions, cbr};

const FILES: [(&str, &[u8]); 2] = [("first.txt", b"alpha"), ("folder/second.txt", b"bravo!!")];

mod raw_rar4 {
    const SIGNATURE: [u8; 7] = *b"Rar!\x1a\x07\x00";
    const END_OF_ARCHIVE: [u8; 7] = [0xc4, 0x3d, 0x7b, 0x00, 0x40, 0x07, 0x00];
    const MAIN_HEADER: u8 = 0x73;
    const FILE_HEADER: u8 = 0x74;
    const HAS_DATA: u16 = 0x8000;
    const WINDOWS_HOST: u8 = 2;
    const UNPACK_VERSION: u8 = 29;
    const STORED: u8 = 0x30;
    const ARCHIVE_ATTRIBUTE: u32 = 0x20;

    fn crc32(bytes: &[u8]) -> u32 {
        !bytes.iter().fold(!0_u32, |crc, byte| {
            (0..8).fold(crc ^ u32::from(*byte), |crc, _| {
                (crc >> 1) ^ (0xedb8_8320 & 0_u32.wrapping_sub(crc & 1))
            })
        })
    }

    fn block(kind: u8, flags: u16, fields: &[u8], data: &[u8]) -> Vec<u8> {
        let size = u16::try_from(7 + fields.len()).unwrap();
        let after_crc = [
            vec![kind],
            flags.to_le_bytes().to_vec(),
            size.to_le_bytes().to_vec(),
            fields.to_vec(),
        ]
        .concat();
        let crc = u16::try_from(crc32(&after_crc) & 0xffff).unwrap();
        [crc.to_le_bytes().to_vec(), after_crc, data.to_vec()].concat()
    }

    pub(super) fn stored_with_raw_name(name: &[u8], content: &[u8]) -> Vec<u8> {
        let length = u32::try_from(content.len()).unwrap();
        let fields = [
            length.to_le_bytes().to_vec(),
            length.to_le_bytes().to_vec(),
            vec![WINDOWS_HOST],
            crc32(content).to_le_bytes().to_vec(),
            vec![0; 4],
            vec![UNPACK_VERSION, STORED],
            u16::try_from(name.len()).unwrap().to_le_bytes().to_vec(),
            ARCHIVE_ATTRIBUTE.to_le_bytes().to_vec(),
            name.to_vec(),
        ]
        .concat();
        [
            SIGNATURE.to_vec(),
            block(MAIN_HEADER, 0, &[0; 6], &[]),
            block(FILE_HEADER, HAS_DATA, &fields, content),
            END_OF_ARCHIVE.to_vec(),
        ]
        .concat()
    }
}

fn entries(files: &[(&str, &[u8])]) -> Vec<ArchiveEntry> {
    files
        .iter()
        .map(|(name, bytes)| ArchiveEntry {
            name: (*name).to_owned(),
            bytes: bytes.to_vec(),
        })
        .collect()
}

fn archive(format: RarFormat, method: RarMethod, files: &[(&str, &[u8])]) -> Vec<u8> {
    let options = RarOptions {
        method,
        ..RarOptions::of(format)
    };
    cbr(&entries(files), &options).unwrap()
}

fn stored(format: RarFormat, files: &[(&str, &[u8])]) -> Vec<u8> {
    archive(format, RarMethod::Stored, files)
}

fn rar5_with_dictionary(dictionary_bytes: usize, method: RarMethod) -> Vec<u8> {
    let format = RarFormat::Rar5 {
        compression_version: 0,
        dictionary_bytes: dictionary_bytes as u64,
    };
    archive(format, method, &[("page.bin", b"eight by")])
}

fn listing(archive: Vec<u8>, limit_bytes: usize) -> Result<Vec<(Entry, Vec<u8>)>, Error> {
    let mut reader = Reader::open(Cursor::new(archive), limit_bytes)?;
    let mut listing = Vec::new();
    while let Some(entry) = reader.next_entry()? {
        let mut content = vec![0; 64];
        let length = reader.read_data(&mut content)?;
        content.truncate(length);
        listing.push((entry, content));
    }
    Ok(listing)
}

fn file(path: &str, content: &[u8]) -> (Entry, Vec<u8>) {
    let entry = Entry {
        path: path.to_owned(),
        size: Some(content.len() as u64),
        kind: EntryKind::File,
        is_encrypted: false,
    };
    (entry, content.to_vec())
}

fn expected_listing(files: &[(&str, &[u8])]) -> Vec<(Entry, Vec<u8>)> {
    files
        .iter()
        .map(|(path, content)| file(path, content))
        .collect()
}

fn first_entry_data(archive: Vec<u8>, limit_bytes: usize) -> Result<Vec<u8>, Error> {
    let mut reader = Reader::open(Cursor::new(archive), limit_bytes)?;
    reader.next_entry()?.unwrap();
    let mut content = vec![0; 64];
    let length = reader.read_data(&mut content)?;
    content.truncate(length);
    Ok(content)
}

#[test]
fn reports_the_vendored_libarchive_version() {
    assert!(version().starts_with("libarchive 3.8.10"), "{}", version());
}

#[test]
fn reads_a_stored_rar5_archive_entry_by_entry() {
    let listing = listing(stored(RarFormat::RAR5, &FILES), DEFAULT_LIMIT_BYTES).unwrap();

    assert_eq!(listing, expected_listing(&FILES));
}

#[test]
fn reads_a_stored_rar4_archive_entry_by_entry() {
    let listing = listing(stored(RarFormat::RAR4, &FILES), DEFAULT_LIMIT_BYTES).unwrap();

    assert_eq!(listing, expected_listing(&FILES));
}

#[test]
fn reads_an_entry_after_skipping_the_data_of_the_one_before() {
    for format in [RarFormat::RAR5, RarFormat::RAR4] {
        let mut reader =
            Reader::open(Cursor::new(stored(format, &FILES)), DEFAULT_LIMIT_BYTES).unwrap();
        reader.next_entry().unwrap().unwrap();
        reader.skip_data().unwrap();
        reader.next_entry().unwrap().unwrap();
        let mut content = [0; 16];

        let length = reader.read_data(&mut content).unwrap();

        assert_eq!(&content[..length], b"bravo!!", "{format:?}");
    }
}

#[test]
fn reads_a_rar5_name_outside_ascii_as_utf8() {
    let files: [(&str, &[u8]); 1] = [("caf\u{e9}/\u{65e5}\u{672c}.txt", b"alpha")];

    let listing = listing(stored(RarFormat::RAR5, &files), DEFAULT_LIMIT_BYTES).unwrap();

    assert_eq!(listing, expected_listing(&files));
}

#[test]
fn reads_a_unicode_flagged_rar4_name_as_utf8() {
    let files: [(&str, &[u8]); 1] = [("caf\u{e9}/\u{65e5}\u{672c}.txt", b"alpha")];

    let listing = listing(stored(RarFormat::RAR4, &files), DEFAULT_LIMIT_BYTES).unwrap();

    assert_eq!(listing, expected_listing(&files));
}

#[test]
fn refuses_a_rar4_name_that_is_not_valid_text() {
    let archive = raw_rar4::stored_with_raw_name(b"caf\xe9.txt", b"alpha");

    let result = listing(archive, DEFAULT_LIMIT_BYTES);

    assert!(
        matches!(&result, Err(Error::UnreadableName { lossy }) if lossy == "caf\u{fffd}.txt"),
        "{result:?}"
    );
}

#[test]
fn refuses_input_that_is_not_a_rar_archive() {
    let result = Reader::open(
        Cursor::new(b"plain text, not an archive".to_vec()),
        DEFAULT_LIMIT_BYTES,
    );

    let Err(Error::Archive { message }) = result else {
        panic!("expected a libarchive error");
    };
    assert!(message.contains("Unrecognized archive format"), "{message}");
}

#[test]
fn reads_a_stored_entry_with_the_desktop_dictionary_cap_under_the_desktop_budget() {
    let archive = rar5_with_dictionary(DESKTOP_DICTIONARY_CAP_BYTES, RarMethod::Stored);

    let data = first_entry_data(archive, DESKTOP_LIMIT_BYTES).unwrap();

    assert_eq!(data, b"eight by");
}

#[test]
fn reads_a_stored_entry_with_the_mobile_dictionary_cap_under_the_mobile_budget() {
    let archive = rar5_with_dictionary(MOBILE_DICTIONARY_CAP_BYTES, RarMethod::Stored);

    let data = first_entry_data(archive, MOBILE_LIMIT_BYTES).unwrap();

    assert_eq!(data, b"eight by");
}

#[test]
fn starts_decompressing_with_the_desktop_dictionary_cap_under_the_desktop_budget() {
    let archive = rar5_with_dictionary(DESKTOP_DICTIONARY_CAP_BYTES, RarMethod::DeclaredCompressed);

    let result = first_entry_data(archive, DESKTOP_LIMIT_BYTES);

    assert!(
        matches!(&result, Err(Error::Archive { message }) if message == COMPRESSED_STREAM_ERROR),
        "{result:?}"
    );
}

#[test]
fn starts_decompressing_with_the_mobile_dictionary_cap_under_the_mobile_budget() {
    let archive = rar5_with_dictionary(MOBILE_DICTIONARY_CAP_BYTES, RarMethod::DeclaredCompressed);

    let result = first_entry_data(archive, MOBILE_LIMIT_BYTES);

    assert!(
        matches!(&result, Err(Error::Archive { message }) if message == COMPRESSED_STREAM_ERROR),
        "{result:?}"
    );
}

#[test]
fn refuses_the_desktop_dictionary_cap_under_the_mobile_budget() {
    let archive = rar5_with_dictionary(DESKTOP_DICTIONARY_CAP_BYTES, RarMethod::DeclaredCompressed);

    let result = first_entry_data(archive, MOBILE_LIMIT_BYTES);

    assert!(
        matches!(result, Err(Error::BudgetExceeded { limit_bytes }) if limit_bytes == MOBILE_LIMIT_BYTES),
        "{result:?}"
    );
}

#[test]
fn stays_refused_once_the_budget_is_exceeded() {
    let archive = rar5_with_dictionary(DESKTOP_DICTIONARY_CAP_BYTES, RarMethod::DeclaredCompressed);
    let mut reader = Reader::open(Cursor::new(archive), MOBILE_LIMIT_BYTES).unwrap();
    reader.next_entry().unwrap().unwrap();
    let mut content = [0; 8];
    let first = reader.read_data(&mut content);

    let next = reader.next_entry();

    assert!(
        matches!(first, Err(Error::BudgetExceeded { .. })),
        "{first:?}"
    );
    assert!(
        matches!(next, Err(Error::BudgetExceeded { .. })),
        "{next:?}"
    );
}

struct OverReportingSource(Cursor<Vec<u8>>);

impl Read for OverReportingSource {
    fn read(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
        let read = self.0.read(buffer)?;
        Ok(if read == 0 { 0 } else { buffer.len() * 4 })
    }
}

impl Seek for OverReportingSource {
    fn seek(&mut self, position: SeekFrom) -> io::Result<u64> {
        self.0.seek(position)
    }
}

#[test]
fn refuses_a_source_that_reports_more_bytes_than_it_was_given() {
    let source = OverReportingSource(Cursor::new(stored(RarFormat::RAR5, &FILES)));

    let result = Reader::open(source, DEFAULT_LIMIT_BYTES);

    assert!(
        matches!(result, Err(Error::Source(_))),
        "{:?}",
        result.err()
    );
}

const COMPRESSED_STREAM_ERROR: &str = "Unsupported block header size (was 4, max is 2)";
