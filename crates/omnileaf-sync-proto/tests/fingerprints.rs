mod support;

use std::ops::Range;

use omnileaf_sync_proto::{BookId, Fingerprint, FingerprintError, FingerprintKind, ImageEntry};
use proptest::prelude::*;

const KIB: u64 = 1024;

fn page(crc32: u32, size: u64) -> ImageEntry {
    ImageEntry { crc32, size }
}

fn three_pages() -> Vec<ImageEntry> {
    vec![page(0x1111, 900), page(0x2222, 800), page(0x3333, 700)]
}

fn raw1_of(content: &[u8]) -> Result<Fingerprint, FingerprintError> {
    Fingerprint::raw1(content.len() as u64, &support::raw1_samples(content))
}

#[test]
fn page_manifest_fingerprints_ignore_the_entry_order() {
    let mut reversed = three_pages();
    reversed.reverse();

    let fingerprint = Fingerprint::pmf1(reversed).unwrap();

    assert_eq!(fingerprint, Fingerprint::pmf1(three_pages()).unwrap());
    assert_eq!(fingerprint.kind(), FingerprintKind::Pmf1);
}

#[test]
fn page_manifest_fingerprints_change_when_a_page_changes() {
    let mut edited = three_pages();
    edited[1].crc32 = 0x2223;

    let fingerprint = Fingerprint::pmf1(edited).unwrap();

    assert_ne!(fingerprint, Fingerprint::pmf1(three_pages()).unwrap());
}

#[test]
fn page_manifest_fingerprints_change_when_a_page_is_added_or_removed() {
    let original = Fingerprint::pmf1(three_pages()).unwrap();

    let added = Fingerprint::pmf1(three_pages().into_iter().chain([page(0x4444, 600)]));
    let removed = Fingerprint::pmf1(three_pages().into_iter().take(2));

    assert_ne!(added.unwrap(), original);
    assert_ne!(removed.unwrap(), original);
}

#[test]
fn page_manifest_fingerprints_count_repeated_pages() {
    let once = Fingerprint::pmf1([page(0x1111, 900)]).unwrap();

    let twice = Fingerprint::pmf1([page(0x1111, 900), page(0x1111, 900)]).unwrap();

    assert_ne!(once, twice);
}

#[test]
fn an_archive_without_images_has_no_page_manifest_fingerprint() {
    let fingerprint = Fingerprint::pmf1([]);

    assert_eq!(fingerprint, Err(FingerprintError::NoImages));
}

#[test]
fn raw_samples_cover_the_ends_and_eight_evenly_spaced_slices() {
    let size = 900 * KIB;

    let ranges = Fingerprint::raw1_ranges(size);

    let mut expected: Vec<Range<u64>> = vec![0..64 * KIB, size - 64 * KIB..size];
    expected.extend((1..=8).map(|slice| slice * 100 * KIB..slice * 100 * KIB + 16 * KIB));
    assert_eq!(ranges.to_vec(), expected);
}

#[test]
fn raw_samples_stop_at_the_end_of_a_small_file() {
    let ranges = Fingerprint::raw1_ranges(100);

    let mut expected: Vec<Range<u64>> = vec![0..100, 0..100];
    expected.extend((1..=8).map(|slice| 100 * slice / 9..100));
    assert_eq!(ranges.to_vec(), expected);
}

#[test]
fn raw_fingerprints_change_when_a_sampled_byte_changes() {
    let mut content = support::sample_file(300 * KIB);
    let original = raw1_of(&content).unwrap();

    content[usize::try_from(100 * KIB).unwrap()] ^= 1;

    assert_ne!(raw1_of(&content).unwrap(), original);
    assert_eq!(original.kind(), FingerprintKind::Raw1);
}

#[test]
fn raw_fingerprints_need_every_sample() {
    let content = support::sample_file(100);

    let fingerprint = Fingerprint::raw1(100, &[content.as_slice(); 9]);

    assert_eq!(fingerprint, Err(FingerprintError::SampleCount { count: 9 }));
}

#[test]
fn raw_fingerprints_reject_a_sample_of_the_wrong_length() {
    let content = support::sample_file(100);
    let mut samples = support::raw1_samples(&content);
    samples[4] = &content[..10];

    let fingerprint = Fingerprint::raw1(100, &samples);

    assert!(matches!(
        fingerprint,
        Err(FingerprintError::SampleLength {
            index: 4,
            actual: 10,
            ..
        })
    ));
}

#[test]
fn a_book_keeps_its_id_while_its_pages_stay_the_same() {
    let mut reordered = three_pages();
    reordered.rotate_left(1);

    let id = BookId::local(&Fingerprint::pmf1(reordered).unwrap());

    assert_eq!(
        id,
        BookId::local(&Fingerprint::pmf1(three_pages()).unwrap())
    );
}

#[test]
fn books_with_different_pages_get_different_ids() {
    let other = Fingerprint::pmf1([page(0x9999, 1)]).unwrap();

    let id = BookId::local(&other);

    assert_ne!(
        id,
        BookId::local(&Fingerprint::pmf1(three_pages()).unwrap())
    );
}

fn entries() -> impl Strategy<Value = Vec<ImageEntry>> {
    prop::collection::vec((any::<u32>(), any::<u64>()), 1..64).prop_map(|pairs| {
        pairs
            .into_iter()
            .map(|(crc32, size)| page(crc32, size))
            .collect()
    })
}

proptest! {
    #[test]
    fn page_manifest_fingerprints_ignore_any_reordering(
        (original, shuffled) in entries().prop_flat_map(|pages| (Just(pages.clone()), Just(pages).prop_shuffle()))
    ) {
        prop_assert_eq!(Fingerprint::pmf1(shuffled).unwrap(), Fingerprint::pmf1(original).unwrap());
    }

    #[test]
    fn raw_samples_stay_inside_the_file(size in any::<u64>()) {
        let ranges = Fingerprint::raw1_ranges(size);

        prop_assert!(ranges.iter().all(|range| range.start <= range.end && range.end <= size));
    }
}
