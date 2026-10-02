#![expect(
    clippy::unwrap_used,
    reason = "the golden files are committed, so one that does not load should stop the test"
)]

mod support;

use std::fmt::Write;

use omnileaf_sync_proto::{BookId, CategoryId, Fingerprint, Hlc, ImageEntry, SeriesId, norm};
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

#[derive(Debug, Deserialize)]
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
        write!(text, "{byte:02x}").unwrap();
        text
    })
}

#[test]
fn fingerprints_and_book_ids_match_the_golden_vectors() {
    let vectors: Vec<FingerprintVector> = golden(include_str!("golden/fingerprints.json"));

    for vector in vectors {
        let fingerprint = fingerprint_of(&vector.input);

        assert_eq!(
            hex(fingerprint.as_bytes()),
            vector.fingerprint,
            "{:?}",
            vector.input
        );
        assert_eq!(
            BookId::local(&fingerprint).to_string(),
            vector.book_id,
            "{:?}",
            vector.input
        );
    }
}

#[derive(Deserialize)]
struct ClockGolden {
    stamps: Vec<StampVector>,
    sequences: Vec<SequenceVector>,
}

#[derive(Deserialize)]
struct StampVector {
    unix_ms: u64,
    counter: u16,
    hlc: u64,
}

#[derive(Deserialize)]
struct SequenceVector {
    start: u64,
    events: Vec<ClockEvent>,
    after: Vec<u64>,
}

#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
enum ClockEvent {
    Tick(u64),
    Observe(u64),
}

#[test]
fn clock_stamps_match_the_golden_vectors() {
    let golden: ClockGolden = serde_json::from_str(include_str!("golden/clock.json")).unwrap();

    for vector in golden.stamps {
        let hlc = Hlc::new(vector.unix_ms, vector.counter).unwrap();

        assert_eq!(
            hlc.as_u64(),
            vector.hlc,
            "{} {}",
            vector.unix_ms,
            vector.counter
        );
        assert_eq!(hlc.unix_ms(), vector.unix_ms, "{}", vector.hlc);
    }
}

#[test]
fn clock_sequences_match_the_golden_vectors() {
    let golden: ClockGolden = serde_json::from_str(include_str!("golden/clock.json")).unwrap();

    for vector in golden.sequences {
        let mut clock = Hlc::from(vector.start);
        let mut after = Vec::new();
        for &event in &vector.events {
            clock = match event {
                ClockEvent::Tick(now) => clock.tick(now).unwrap(),
                ClockEvent::Observe(remote) => clock.observe(Hlc::from(remote)),
            };
            after.push(clock.as_u64());
        }

        assert_eq!(
            after, vector.after,
            "from {} through {:?}",
            vector.start, vector.events
        );
    }
}
