#![expect(
    clippy::unwrap_used,
    reason = "the archives are built in memory and written to a scratch folder, so a failed set-up should stop the test"
)]

use omnileaf_formats::{FormatError, open_book};
use omnileaf_testkit::ScratchFolder;

const SIGNATURE: &[u8] = b"7z\xbc\xaf\x27\x1c";
const VERSION: [u8; 2] = [0, 4];
const HEADER: u8 = 0x01;
const MAIN_STREAMS_INFO: u8 = 0x04;
const FILES_INFO: u8 = 0x05;
const PACK_INFO: u8 = 0x06;
const UNPACK_INFO: u8 = 0x07;
const SUB_STREAMS_INFO: u8 = 0x08;
const SIZE: u8 = 0x09;
const FOLDER: u8 = 0x0B;
const CODERS_UNPACK_SIZE: u8 = 0x0C;
const NUM_UNPACK_STREAM: u8 = 0x0D;
const NAME: u8 = 0x11;
const ENCODED_HEADER: u8 = 0x17;
const END: u8 = 0x00;
const NOT_EXTERNAL: u8 = 0x00;
const HAS_PROPERTIES: u8 = 0x20;

const LZMA: &[u8] = &[0x03, 0x01, 0x01];
const LZMA2: &[u8] = &[0x21];
const AES: &[u8] = &[0x06, 0xF1, 0x07, 0x01];
const PPMD: &[u8] = &[0x03, 0x04, 0x01];
const AES_PROPERTIES: [u8; 2] = [0xC8, 0x00];
const PPMD_PROPERTIES: [u8; 5] = [6, 0, 0, 0, 1];
const LZMA_ONE_MIB_DICTIONARY: [u8; 5] = [0x5D, 0x00, 0x00, 0x10, 0x00];
const LZMA2_FOUR_GIB_DICTIONARY: [u8; 1] = [40];
const PACKED: [u8; 16] = [0x5A; 16];
const ONE_TIB: u64 = 1 << 40;
const DECLARED_FILES: u64 = 4 * 1024 * 1024;

struct Coder<'a> {
    id: &'a [u8],
    properties: &'a [u8],
}

/// Writes `value` as a 7z number, whose first byte's leading one bits count the little-endian bytes that follow.
fn number(value: u64) -> Vec<u8> {
    let mut first = 0_u8;
    let mut mask = 0x80_u8;
    let mut extra = 0;
    while extra < 8 && value >= 1 << (7 * (extra + 1)) {
        first |= mask;
        mask >>= 1;
        extra += 1;
    }
    if extra < 8 {
        first |= u8::try_from(value >> (8 * extra)).unwrap();
    }
    let mut bytes = vec![first];
    bytes.extend(value.to_le_bytes().into_iter().take(extra));
    bytes
}

fn crc32(bytes: &[u8]) -> u32 {
    let mut crc = flate2::Crc::new();
    crc.update(bytes);
    crc.sum()
}

fn coder(coder: &Coder<'_>) -> Vec<u8> {
    let id_length = u8::try_from(coder.id.len()).unwrap();
    let mut bytes = if coder.properties.is_empty() {
        vec![id_length]
    } else {
        vec![id_length | HAS_PROPERTIES]
    };
    bytes.extend_from_slice(coder.id);
    if !coder.properties.is_empty() {
        bytes.extend(number(u64::try_from(coder.properties.len()).unwrap()));
        bytes.extend_from_slice(coder.properties);
    }
    bytes
}

fn one_block(coder_used: &Coder<'_>, unpacked: u64) -> Vec<u8> {
    let mut bytes = vec![PACK_INFO];
    bytes.extend(number(0));
    bytes.extend(number(1));
    bytes.push(SIZE);
    bytes.extend(number(PACKED.len() as u64));
    bytes.extend([END, UNPACK_INFO, FOLDER]);
    bytes.extend(number(1));
    bytes.push(NOT_EXTERNAL);
    bytes.extend(number(1));
    bytes.extend(coder(coder_used));
    bytes.push(CODERS_UNPACK_SIZE);
    bytes.extend(number(unpacked));
    bytes.push(END);
    bytes
}

fn plain_header(coder_used: &Coder<'_>, names: &[&str], size: u64) -> Vec<u8> {
    let count = names.len() as u64;
    let mut bytes = vec![HEADER, MAIN_STREAMS_INFO];
    bytes.extend(one_block(coder_used, size * count));
    bytes.push(SUB_STREAMS_INFO);
    bytes.push(NUM_UNPACK_STREAM);
    bytes.extend(number(count));
    bytes.push(SIZE);
    for _ in 1..names.len() {
        bytes.extend(number(size));
    }
    bytes.extend([END, END, FILES_INFO]);
    bytes.extend(number(count));
    let utf16_names: Vec<u8> = names
        .iter()
        .flat_map(|name| name.encode_utf16().chain([0]))
        .flat_map(u16::to_le_bytes)
        .collect();
    bytes.push(NAME);
    bytes.extend(number(utf16_names.len() as u64 + 1));
    bytes.push(NOT_EXTERNAL);
    bytes.extend(utf16_names);
    bytes.extend([END, END]);
    bytes
}

fn encoded_header(coder_used: &Coder<'_>, unpacked: u64) -> Vec<u8> {
    let mut bytes = vec![ENCODED_HEADER];
    bytes.extend(one_block(coder_used, unpacked));
    bytes.push(END);
    bytes
}

fn archive(next_header: &[u8]) -> Vec<u8> {
    let mut start_header = Vec::new();
    start_header.extend((PACKED.len() as u64).to_le_bytes());
    start_header.extend((next_header.len() as u64).to_le_bytes());
    start_header.extend(crc32(next_header).to_le_bytes());
    let mut bytes = SIGNATURE.to_vec();
    bytes.extend(VERSION);
    bytes.extend(crc32(&start_header).to_le_bytes());
    bytes.extend(start_header);
    bytes.extend(PACKED);
    bytes.extend(next_header);
    bytes
}

fn open_error(name: &str, bytes: &[u8]) -> FormatError {
    let scratch = ScratchFolder::new(name);
    let path = scratch.write("book.cb7", bytes);
    open_book(&path).unwrap_err()
}

#[test]
fn reports_a_cb7_with_encrypted_pages_as_encrypted() {
    let aes = Coder {
        id: AES,
        properties: &AES_PROPERTIES,
    };

    let error = open_error(
        "crafted-encrypted-pages",
        &archive(&plain_header(&aes, &["1.png"], 16)),
    );

    assert!(matches!(error, FormatError::Encrypted { .. }), "{error:?}");
}

#[test]
fn reports_a_cb7_with_encrypted_names_as_encrypted() {
    let aes = Coder {
        id: AES,
        properties: &AES_PROPERTIES,
    };

    let error = open_error(
        "crafted-encrypted-names",
        &archive(&encoded_header(&aes, 64)),
    );

    assert!(matches!(error, FormatError::Encrypted { .. }), "{error:?}");
}

#[test]
fn refuses_a_cb7_packed_with_a_method_this_app_cannot_decode() {
    let ppmd = Coder {
        id: PPMD,
        properties: &PPMD_PROPERTIES,
    };

    let error = open_error(
        "crafted-ppmd",
        &archive(&plain_header(&ppmd, &["1.png"], 16)),
    );

    assert!(
        matches!(&error, FormatError::UnsupportedCompression { method, .. } if method == "PPMD"),
        "{error:?}"
    );
}

#[test]
fn refuses_a_cb7_whose_header_needs_a_huge_dictionary() {
    let lzma2 = Coder {
        id: LZMA2,
        properties: &LZMA2_FOUR_GIB_DICTIONARY,
    };

    let error = open_error(
        "crafted-header-dictionary",
        &archive(&encoded_header(&lzma2, 64)),
    );

    assert!(
        matches!(error, FormatError::DictionaryTooLarge { .. }),
        "{error:?}"
    );
}

#[test]
fn refuses_a_cb7_whose_header_unpacks_past_the_limit() {
    let lzma = Coder {
        id: LZMA,
        properties: &LZMA_ONE_MIB_DICTIONARY,
    };

    let error = open_error(
        "crafted-header-unpack",
        &archive(&encoded_header(&lzma, ONE_TIB)),
    );

    assert!(
        matches!(error, FormatError::HeaderTooLarge { .. }),
        "{error:?}"
    );
}

#[test]
fn refuses_a_cb7_whose_header_declares_millions_of_files() {
    let mut header = vec![HEADER, FILES_INFO];
    header.extend(number(DECLARED_FILES));
    header.resize(usize::try_from(DECLARED_FILES).unwrap() + PACKED.len(), END);

    let error = open_error("crafted-header-files", &archive(&header));

    assert!(
        matches!(error, FormatError::HeaderTooLarge { .. }),
        "{error:?}"
    );
}
