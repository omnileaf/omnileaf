#![expect(
    clippy::unwrap_used,
    reason = "the golden files are committed, so one that does not load should stop the test"
)]

mod support;

use std::fmt::Write;

use omnileaf_sync_proto::{BookId, CategoryId, Fingerprint, ImageEntry, SeriesId, norm};
use serde::Deserialize;

#[derive(Deserialize)]
struct Golden<V> {
    vectors: Vec<V>,
}

fn golden<V: for<'de> Deserialize<'de>>(json: &str) -> Vec<V> {
    serde_json::from_str::<Golden<V>>(json).unwrap().vectors
}

#[derive(Deserialize)]
struct NormVector {
    input: String,
    norm: String,
}

#[test]
fn norm_matches_the_golden_vectors() {
    let vectors: Vec<NormVector> = golden(include_str!("golden/norm.json"));

    for vector in vectors {
        assert_eq!(norm(&vector.input), vector.norm, "{:?}", vector.input);
    }
}

#[derive(Deserialize)]
struct IdVector {
    key: String,
    input: String,
    id: String,
}

#[test]
fn ids_match_the_golden_vectors() {
    let vectors: Vec<IdVector> = golden(include_str!("golden/ids.json"));

    for vector in vectors {
        let id = match vector.key.as_str() {
            "series.local.v1" => SeriesId::local(&vector.input).unwrap().to_string(),
            "category.v1" => CategoryId::from_name(&vector.input).unwrap().to_string(),
            other => panic!("no derivation for key {other}"),
        };
        assert_eq!(id, vector.id, "{} {:?}", vector.key, vector.input);
    }
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
enum FingerprintInput {
    Pmf1 { entries: Vec<(u32, u64)> },
    Raw1 { size: u64 },
}

#[derive(Deserialize)]
struct FingerprintVector {
    #[serde(flatten)]
    input: FingerprintInput,
    fingerprint: String,
    book_id: String,
}

fn fingerprint_of(input: &FingerprintInput) -> Fingerprint {
    match input {
        FingerprintInput::Pmf1 { entries } => Fingerprint::pmf1(
            entries
                .iter()
                .map(|&(crc32, size)| ImageEntry { crc32, size }),
        )
        .unwrap(),
        FingerprintInput::Raw1 { size } => {
            let content = support::sample_file(*size);
            Fingerprint::raw1(*size, &support::raw1_samples(&content)).unwrap()
        }
    }
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().fold(String::new(), |mut text, byte| {
        let _ = write!(text, "{byte:02x}");
        text
    })
}

#[test]
fn fingerprints_and_book_ids_match_the_golden_vectors() {
    let vectors: Vec<FingerprintVector> = golden(include_str!("golden/fingerprints.json"));

    for vector in vectors {
        let fingerprint = fingerprint_of(&vector.input);

        assert_eq!(hex(fingerprint.as_bytes()), vector.fingerprint);
        assert_eq!(
            BookId::local(&fingerprint).unwrap().to_string(),
            vector.book_id
        );
    }
}
