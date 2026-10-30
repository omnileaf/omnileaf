#![expect(
    clippy::unwrap_used,
    reason = "the archives are built in memory, so a failed set-up should stop the test"
)]

use std::{io::Cursor, path::Path};

use omnileaf_formats::{FormatError, Limits, RarListing};
use omnileaf_testkit::{
    ArchiveEntry, Packing, RarEncryption, RarFormat, RarMethod, RarOptions, RarVolume, cbr,
};

const FORMATS: [RarFormat; 2] = [RarFormat::RAR4, RarFormat::RAR5];
const MIB: u64 = 1024 * 1024;
const RAR5_SIGNATURE: &[u8] = b"Rar!\x1a\x07\x01\x00";
const UNCHECKED_CRC: [u8; 4] = [0; 4];
const THREE_MIB_AS_VINT: [u8; 4] = [0x80, 0x80, 0xC0, 0x01];
const LONGEST_NAME_CHARS: usize = 2048;
const RAR2_UNPACK_VERSION: u8 = 20;

fn entry(name: &str, bytes: &[u8]) -> ArchiveEntry {
    ArchiveEntry {
        name: name.to_owned(),
        bytes: bytes.to_vec(),
    }
}

fn pages() -> Vec<ArchiveEntry> {
    vec![entry("2.png", b"second"), entry("1.png", b"first page")]
}

fn listing_with(bytes: &[u8], limits: &Limits) -> Result<RarListing, FormatError> {
    RarListing::read(&mut Cursor::new(bytes), Path::new("book.cbr"), limits)
}

fn listing(bytes: &[u8]) -> Result<RarListing, FormatError> {
    listing_with(bytes, &Limits::default())
}

fn errors_in_every_format(options: impl Fn(RarFormat) -> RarOptions) -> Vec<FormatError> {
    FORMATS
        .into_iter()
        .map(|format| listing(&cbr(&pages(), &options(format)).unwrap()).unwrap_err())
        .collect()
}

#[test]
fn lists_the_pages_of_a_book_in_reading_order_skipping_what_is_not_a_page() {
    let entries = [
        entry("chapter/", b""),
        entry("chapter/10.png", b"ten"),
        entry("ComicInfo.xml", b"<ComicInfo/>"),
        entry("chapter/2.png", b"two"),
        entry("__MACOSX/chapter/._1.png", b"fork"),
        entry("../1.png", b"outside"),
        entry("chapter/1.png", b"one"),
    ];

    let names: Vec<Vec<String>> = FORMATS
        .into_iter()
        .map(|format| {
            let listing = listing(&cbr(&entries, &RarOptions::of(format)).unwrap()).unwrap();
            listing.pages.into_iter().map(|page| page.name).collect()
        })
        .collect();

    let expected = ["chapter/1.png", "chapter/2.png", "chapter/10.png"].map(String::from);
    assert_eq!(names, [expected.to_vec(), expected.to_vec()]);
}

#[test]
fn points_each_page_at_its_entry_and_its_stored_bytes() {
    let entries = [
        entry("chapter/", b""),
        entry("b.png", b"bee"),
        entry("a.png", b"ay!"),
    ];

    for format in FORMATS {
        let bytes = cbr(&entries, &RarOptions::of(format)).unwrap();

        let listing = listing(&bytes).unwrap();

        let stored: Vec<(usize, &[u8])> = listing
            .page_entries
            .iter()
            .map(|&entry| {
                let entry = &listing.entries[entry];
                let start = usize::try_from(entry.data_offset).unwrap();
                let end = start + usize::try_from(entry.packed_size).unwrap();
                (entry.index, &bytes[start..end])
            })
            .collect();
        assert_eq!(stored, [(2, &b"ay!"[..]), (1, &b"bee"[..])], "{format:?}");
    }
}

#[test]
fn reports_each_entry_s_crc32_and_solid_flag() {
    let options = RarOptions {
        packing: Packing::Solid,
        ..RarOptions::of(RarFormat::RAR5)
    };

    let listing = listing(&cbr(&pages(), &options).unwrap()).unwrap();

    let entries: Vec<(Option<u32>, bool)> = listing
        .entries
        .iter()
        .map(|entry| (entry.crc32, entry.is_solid))
        .collect();
    let mut crc = flate2::Crc::new();
    crc.update(b"second");
    let first_crc = crc.sum();
    let mut crc = flate2::Crc::new();
    crc.update(b"first page");
    assert_eq!(entries, [(Some(first_crc), false), (Some(crc.sum()), true)]);
}

#[test]
fn decodes_the_name_of_a_rar4_entry_outside_ascii() {
    let entries = [entry("página.png", b"page")];

    let listing = listing(&cbr(&entries, &RarOptions::of(RarFormat::RAR4)).unwrap()).unwrap();

    assert_eq!(listing.pages[0].name, "página.png");
}

#[test]
fn reports_encrypted_headers_as_encrypted() {
    let errors = errors_in_every_format(|format| RarOptions {
        encryption: RarEncryption::Headers,
        ..RarOptions::of(format)
    });

    assert!(
        errors
            .iter()
            .all(|error| matches!(error, FormatError::Encrypted { .. })),
        "{errors:?}"
    );
}

#[test]
fn reports_encrypted_entries_as_encrypted() {
    let errors = errors_in_every_format(|format| RarOptions {
        encryption: RarEncryption::Entries,
        ..RarOptions::of(format)
    });

    assert!(
        errors
            .iter()
            .all(|error| matches!(error, FormatError::Encrypted { .. })),
        "{errors:?}"
    );
}

#[test]
fn refuses_the_first_volume_of_a_set() {
    let errors = errors_in_every_format(|format| RarOptions {
        volume: RarVolume::First,
        ..RarOptions::of(format)
    });

    assert!(
        errors
            .iter()
            .all(|error| matches!(error, FormatError::MultiVolume { .. })),
        "{errors:?}"
    );
}

#[test]
fn refuses_a_middle_volume_of_a_set() {
    let errors = errors_in_every_format(|format| RarOptions {
        volume: RarVolume::Middle,
        ..RarOptions::of(format)
    });

    assert!(
        errors
            .iter()
            .all(|error| matches!(error, FormatError::MultiVolume { .. })),
        "{errors:?}"
    );
}

#[test]
fn refuses_the_last_volume_of_a_set() {
    let errors = errors_in_every_format(|format| RarOptions {
        volume: RarVolume::Last,
        ..RarOptions::of(format)
    });

    assert!(
        errors
            .iter()
            .all(|error| matches!(error, FormatError::MultiVolume { .. })),
        "{errors:?}"
    );
}

#[test]
fn refuses_rar5_compression_newer_than_version_0() {
    let options = RarOptions {
        format: RarFormat::Rar5 {
            compression_version: 1,
            dictionary_bytes: MIB,
        },
        ..RarOptions::of(RarFormat::RAR5)
    };

    let error = listing(&cbr(&pages(), &options).unwrap()).unwrap_err();

    assert!(
        matches!(error, FormatError::UnsupportedCompression { .. }),
        "{error:?}"
    );
}

#[test]
fn refuses_rar4_entries_compressed_by_rar_older_than_3() {
    let options = RarOptions {
        format: RarFormat::Rar4 {
            unpack_version: RAR2_UNPACK_VERSION,
        },
        method: RarMethod::DeclaredCompressed,
        ..RarOptions::of(RarFormat::RAR4)
    };

    let error = listing(&cbr(&pages(), &options).unwrap()).unwrap_err();

    assert!(
        matches!(error, FormatError::UnsupportedCompression { .. }),
        "{error:?}"
    );
}

#[test]
fn lists_rar4_entries_stored_by_rar_older_than_3() {
    let options = RarOptions {
        format: RarFormat::Rar4 {
            unpack_version: RAR2_UNPACK_VERSION,
        },
        ..RarOptions::of(RarFormat::RAR4)
    };

    let listing = listing(&cbr(&pages(), &options).unwrap()).unwrap();

    assert_eq!(listing.pages.len(), 2);
}

#[test]
fn refuses_a_solid_rar4_the_decoder_cannot_read() {
    let options = RarOptions {
        packing: Packing::Solid,
        ..RarOptions::of(RarFormat::RAR4)
    };

    let error = listing(&cbr(&pages(), &options).unwrap()).unwrap_err();

    assert!(
        matches!(error, FormatError::UnsupportedCompression { .. }),
        "{error:?}"
    );
}

fn dictionary_error(dictionary_bytes: u64) -> Option<FormatError> {
    let options = RarOptions {
        format: RarFormat::Rar5 {
            compression_version: 0,
            dictionary_bytes,
        },
        ..RarOptions::of(RarFormat::RAR5)
    };
    listing(&cbr(&pages(), &options).unwrap()).err()
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[test]
fn refuses_a_rar5_entry_needing_a_dictionary_above_64_mib_on_desktop() {
    let error = dictionary_error(128 * MIB);

    assert!(
        matches!(error, Some(FormatError::DictionaryTooLarge { limit, .. }) if limit == 64 * MIB),
        "{error:?}"
    );
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[test]
fn lists_a_rar5_entry_needing_a_64_mib_dictionary_on_desktop() {
    let error = dictionary_error(64 * MIB);

    assert!(error.is_none(), "{error:?}");
}

#[cfg(any(target_os = "android", target_os = "ios"))]
#[test]
fn refuses_a_rar5_entry_needing_a_dictionary_above_32_mib_on_phones() {
    let error = dictionary_error(64 * MIB);

    assert!(
        matches!(error, Some(FormatError::DictionaryTooLarge { limit, .. }) if limit == 32 * MIB),
        "{error:?}"
    );
}

#[cfg(any(target_os = "android", target_os = "ios"))]
#[test]
fn lists_a_rar5_entry_needing_a_32_mib_dictionary_on_phones() {
    let error = dictionary_error(32 * MIB);

    assert!(error.is_none(), "{error:?}");
}

#[test]
fn refuses_more_entries_than_the_limit() {
    let limits = Limits {
        max_entries: 1,
        ..Limits::default()
    };

    let errors: Vec<FormatError> = FORMATS
        .into_iter()
        .map(|format| {
            listing_with(&cbr(&pages(), &RarOptions::of(format)).unwrap(), &limits).unwrap_err()
        })
        .collect();

    assert!(
        errors.iter().all(|error| matches!(
            error,
            FormatError::TooManyEntries {
                count: 2,
                limit: 1,
                ..
            }
        )),
        "{errors:?}"
    );
}

#[test]
fn refuses_entries_declaring_more_bytes_in_total_than_the_limit() {
    let limits = Limits {
        max_page_bytes: u64::MAX,
        ..Limits::default()
    };

    let errors: Vec<FormatError> = FORMATS
        .into_iter()
        .map(|format| {
            let options = RarOptions {
                declared_unpacked_size: Some(3 * 1024 * MIB),
                ..RarOptions::of(format)
            };
            listing_with(&cbr(&pages(), &options).unwrap(), &limits).unwrap_err()
        })
        .collect();

    assert!(
        errors
            .iter()
            .all(|error| matches!(error, FormatError::TooLargeInTotal { .. })),
        "{errors:?}"
    );
}

#[test]
fn refuses_a_page_declaring_more_bytes_than_the_limit() {
    let errors = errors_in_every_format(|format| RarOptions {
        declared_unpacked_size: Some(512 * MIB),
        ..RarOptions::of(format)
    });

    assert!(
        errors.iter().all(
            |error| matches!(error, FormatError::PageTooLarge { name, .. } if name == "2.png")
        ),
        "{errors:?}"
    );
}

#[test]
fn refuses_an_entry_expanding_past_the_compression_ratio() {
    let errors = errors_in_every_format(|format| RarOptions {
        declared_unpacked_size: Some(MIB),
        method: RarMethod::DeclaredCompressed,
        ..RarOptions::of(format)
    });

    assert!(
        errors.iter().all(
            |error| matches!(error, FormatError::SuspiciousCompression { name, .. } if name == "2.png")
        ),
        "{errors:?}"
    );
}

#[test]
fn refuses_a_rar5_header_above_2_mib_before_reading_it() {
    let bytes = [RAR5_SIGNATURE, &UNCHECKED_CRC, &THREE_MIB_AS_VINT].concat();

    let error = listing(&bytes).unwrap_err();

    assert!(
        matches!(error, FormatError::HeaderTooLarge { limit, .. } if limit == 2 * MIB),
        "{error:?}"
    );
}

#[test]
fn refuses_an_entry_name_above_2048_characters() {
    let name = format!("{}.png", "é".repeat(LONGEST_NAME_CHARS));

    let errors: Vec<FormatError> = FORMATS
        .into_iter()
        .map(|format| {
            listing(&cbr(&[entry(&name, b"page")], &RarOptions::of(format)).unwrap()).unwrap_err()
        })
        .collect();

    assert!(
        errors.iter().all(|error| matches!(
            error,
            FormatError::NameTooLong {
                limit: LONGEST_NAME_CHARS,
                ..
            }
        )),
        "{errors:?}"
    );
}

#[test]
fn reports_a_header_whose_crc_does_not_match_as_damaged() {
    let errors: Vec<FormatError> = FORMATS
        .into_iter()
        .map(|format| {
            let mut bytes = cbr(&pages(), &RarOptions::of(format)).unwrap();
            let name = bytes
                .windows(5)
                .position(|window| window == b"2.png")
                .unwrap();
            bytes[name] = b'3';
            listing(&bytes).unwrap_err()
        })
        .collect();

    assert!(
        errors
            .iter()
            .all(|error| matches!(error, FormatError::CorruptRar { .. })),
        "{errors:?}"
    );
}

#[test]
fn reports_an_entry_whose_data_runs_past_the_end_as_damaged() {
    let entries = [entry("1.png", &[0x5A; 64])];

    let errors: Vec<FormatError> = FORMATS
        .into_iter()
        .map(|format| {
            let bytes = cbr(&entries, &RarOptions::of(format)).unwrap();
            let name = bytes
                .windows(5)
                .position(|window| window == b"1.png")
                .unwrap();
            listing(&bytes[..name + 16]).unwrap_err()
        })
        .collect();

    assert!(
        errors
            .iter()
            .all(|error| matches!(error, FormatError::CorruptRar { .. })),
        "{errors:?}"
    );
}
