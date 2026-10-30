#![expect(
    clippy::unwrap_used,
    reason = "the archives are built in memory, so a failed set-up should stop the test"
)]

use std::io::Cursor;

use omnileaf_libarchive::{
    DEFAULT_LIMIT_BYTES, DESKTOP_LIMIT_BYTES, Entry, EntryKind, Error, Reader, version,
};

mod archives {
    const RAR4_SIGNATURE: [u8; 7] = *b"Rar!\x1a\x07\x00";
    const RAR5_SIGNATURE: [u8; 8] = *b"Rar!\x1a\x07\x01\x00";
    const UNIX_REGULAR_FILE_MODE: usize = 0o100_644;
    const STORED: usize = 0;
    const FASTEST_METHOD: usize = 1 << 7;
    const DICTIONARY_SIZE_SHIFT: usize = 10;
    const RAR4_END_OF_ARCHIVE: [u8; 7] = [0xc4, 0x3d, 0x7b, 0x00, 0x40, 0x07, 0x00];

    fn crc32(bytes: &[u8]) -> u32 {
        !bytes.iter().fold(!0_u32, |crc, byte| {
            (0..8).fold(crc ^ u32::from(*byte), |crc, _| {
                (crc >> 1) ^ (0xedb8_8320 & 0_u32.wrapping_sub(crc & 1))
            })
        })
    }

    fn vint(mut value: usize) -> Vec<u8> {
        let mut bytes = Vec::new();
        loop {
            let low = u8::try_from(value & 0x7f).unwrap();
            value >>= 7;
            if value == 0 {
                bytes.push(low);
                return bytes;
            }
            bytes.push(low | 0x80);
        }
    }

    fn rar5_block(kind: usize, flags: usize, fields: &[u8], data: &[u8]) -> Vec<u8> {
        let mut body = [vint(kind), vint(flags)].concat();
        if !data.is_empty() {
            body.extend(vint(data.len()));
        }
        body.extend(fields);
        let sized = [vint(body.len()), body].concat();
        [crc32(&sized).to_le_bytes().to_vec(), sized, data.to_vec()].concat()
    }

    fn rar5_file(name: &str, content: &[u8], compression: usize) -> Vec<u8> {
        let fields = [
            vint(0x04),
            vint(content.len()),
            vint(UNIX_REGULAR_FILE_MODE),
            crc32(content).to_le_bytes().to_vec(),
            vint(compression),
            vint(1),
            vint(name.len()),
            name.as_bytes().to_vec(),
        ]
        .concat();
        rar5_block(2, 0x02, &fields, content)
    }

    pub(super) fn stored_rar5(files: &[(&str, &[u8])]) -> Vec<u8> {
        let mut archive = RAR5_SIGNATURE.to_vec();
        archive.extend(rar5_block(1, 0, &vint(0), &[]));
        for (name, content) in files {
            archive.extend(rar5_file(name, content, STORED));
        }
        archive.extend(rar5_block(5, 0, &vint(0), &[]));
        archive
    }

    pub(super) fn rar5_with_dictionary(size_step: usize) -> Vec<u8> {
        let mut archive = RAR5_SIGNATURE.to_vec();
        archive.extend(rar5_block(1, 0, &vint(0), &[]));
        archive.extend(rar5_file(
            "packed.bin",
            &[0; 8],
            FASTEST_METHOD | (size_step << DICTIONARY_SIZE_SHIFT),
        ));
        archive.extend(rar5_block(5, 0, &vint(0), &[]));
        archive
    }

    fn rar4_block(kind: u8, flags: u16, fields: &[u8], data: &[u8]) -> Vec<u8> {
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

    fn rar4_file(name: &str, content: &[u8]) -> Vec<u8> {
        let length = u32::try_from(content.len()).unwrap();
        let fields = [
            length.to_le_bytes().to_vec(),
            length.to_le_bytes().to_vec(),
            vec![2],
            crc32(content).to_le_bytes().to_vec(),
            vec![0; 4],
            vec![29, 0x30],
            u16::try_from(name.len()).unwrap().to_le_bytes().to_vec(),
            0x20_u32.to_le_bytes().to_vec(),
            name.as_bytes().to_vec(),
        ]
        .concat();
        rar4_block(0x74, 0x8000, &fields, content)
    }

    pub(super) fn stored_rar4(files: &[(&str, &[u8])]) -> Vec<u8> {
        let mut archive = RAR4_SIGNATURE.to_vec();
        archive.extend(rar4_block(0x73, 0, &[0; 6], &[]));
        for (name, content) in files {
            archive.extend(rar4_file(name, content));
        }
        archive.extend(RAR4_END_OF_ARCHIVE);
        archive
    }
}

const THIRTY_TWO_MIB: usize = 8;
const SIXTY_FOUR_MIB: usize = 9;
const FILES: [(&str, &[u8]); 2] = [("first.txt", b"alpha"), ("folder/second.txt", b"bravo!!")];

fn listing(archive: Vec<u8>) -> Vec<(Entry, Vec<u8>)> {
    let mut reader = Reader::open(Cursor::new(archive), DEFAULT_LIMIT_BYTES).unwrap();
    let mut listing = Vec::new();
    while let Some(entry) = reader.next_entry().unwrap() {
        let mut content = vec![0; 64];
        let length = reader.read_data(&mut content).unwrap();
        content.truncate(length);
        listing.push((entry, content));
    }
    listing
}

fn expected_listing() -> Vec<(Entry, Vec<u8>)> {
    FILES
        .iter()
        .map(|(path, content)| {
            let entry = Entry {
                path: (*path).to_owned(),
                size: Some(content.len() as u64),
                kind: EntryKind::File,
                is_encrypted: false,
            };
            (entry, content.to_vec())
        })
        .collect()
}

#[test]
fn reports_the_vendored_libarchive_version() {
    assert!(version().starts_with("libarchive 3.8.10"), "{}", version());
}

#[test]
fn reads_a_stored_rar5_archive_entry_by_entry() {
    let listing = listing(archives::stored_rar5(&FILES));

    assert_eq!(listing, expected_listing());
}

#[test]
fn reads_a_stored_rar4_archive_entry_by_entry() {
    let listing = listing(archives::stored_rar4(&FILES));

    assert_eq!(listing, expected_listing());
}

#[test]
fn reads_an_entry_after_skipping_the_data_of_the_one_before() {
    for archive in [archives::stored_rar5(&FILES), archives::stored_rar4(&FILES)] {
        let mut reader = Reader::open(Cursor::new(archive), DEFAULT_LIMIT_BYTES).unwrap();
        reader.next_entry().unwrap().unwrap();
        reader.skip_data().unwrap();
        reader.next_entry().unwrap().unwrap();
        let mut content = [0; 16];

        let length = reader.read_data(&mut content).unwrap();

        assert_eq!(&content[..length], b"bravo!!");
    }
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
fn moves_to_another_thread_with_its_budget() {
    fn assert_send<T: Send>() {}

    assert_send::<Reader<Cursor<Vec<u8>>>>();
}

#[test]
fn refuses_a_dictionary_the_default_budget_cannot_hold() {
    let mut reader = Reader::open(
        Cursor::new(archives::rar5_with_dictionary(SIXTY_FOUR_MIB)),
        DEFAULT_LIMIT_BYTES,
    )
    .unwrap();
    reader.next_entry().unwrap().unwrap();
    let mut content = [0; 8];

    let result = reader.read_data(&mut content);

    assert!(
        matches!(result, Err(Error::BudgetExceeded { limit_bytes }) if limit_bytes == DEFAULT_LIMIT_BYTES),
        "{result:?}"
    );
}

#[test]
fn reads_a_dictionary_the_desktop_budget_holds() {
    let mut reader = Reader::open(
        Cursor::new(archives::rar5_with_dictionary(THIRTY_TWO_MIB)),
        DESKTOP_LIMIT_BYTES,
    )
    .unwrap();
    reader.next_entry().unwrap().unwrap();
    let mut content = [0; 8];

    let result = reader.read_data(&mut content);

    assert!(
        !matches!(result, Err(Error::BudgetExceeded { .. })),
        "{result:?}"
    );
}
