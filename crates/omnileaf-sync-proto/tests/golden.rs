#![expect(
    clippy::unwrap_used,
    reason = "the golden files are committed, so one that does not load should stop the test"
)]

mod support;

use std::fmt::Write;

use omnileaf_sync_proto::{
    BookId, CategoryId, Fingerprint, FolderImage, Hlc, ImageEntry, SeriesId, SourceId, Value, norm,
};
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
    input: Option<String>,
    id: String,
}

#[test]
fn ids_match_the_golden_vectors() {
    let vectors: Vec<IdVector> = golden(include_str!("golden/ids.json"));

    for vector in vectors {
        let id = match (vector.key.as_str(), vector.input.as_deref()) {
            ("series.local.v1", Some(input)) => SeriesId::local(input).unwrap().to_string(),
            ("category.v1", Some(input)) => CategoryId::from_name(input).unwrap().to_string(),
            ("source.local.v1", None) => SourceId::local().to_string(),
            (key, input) => panic!("no derivation for key {key} from {input:?}"),
        };
        assert_eq!(id, vector.id, "{} {:?}", vector.key, vector.input);
    }
}

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
enum FingerprintInput {
    Pmf1 { entries: Vec<(u32, u64)> },
    Dir1 { files: Vec<(String, u64)> },
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
        FingerprintInput::Dir1 { files } => support::dir1_of_sample_files(
            files
                .iter()
                .map(|(name, size)| FolderImage {
                    name: name.clone(),
                    size: *size,
                })
                .collect(),
        ),
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
enum ValueInput {
    Null,
    Bool(bool),
    Unsigned(u64),
}

impl From<ValueInput> for Value {
    fn from(input: ValueInput) -> Self {
        match input {
            ValueInput::Null => Self::Null,
            ValueInput::Bool(flag) => Self::Bool(flag),
            ValueInput::Unsigned(number) => Self::Unsigned(number),
        }
    }
}

#[derive(Deserialize)]
struct ValueVector {
    value: ValueInput,
    cbor: String,
}

#[test]
fn register_values_match_the_golden_vectors() {
    let vectors: Vec<ValueVector> = golden(include_str!("golden/values.json"));

    for vector in vectors {
        let value = Value::from(vector.value);

        assert_eq!(hex(&value.to_cbor()), vector.cbor, "{value:?}");
        assert_eq!(
            Value::from_cbor(&unhex(&vector.cbor)),
            Ok(value),
            "{}",
            vector.cbor
        );
    }
}

fn unhex(text: &str) -> Vec<u8> {
    text.as_bytes()
        .chunks(2)
        .map(|pair| u8::from_str_radix(std::str::from_utf8(pair).unwrap(), 16).unwrap())
        .collect()
}
