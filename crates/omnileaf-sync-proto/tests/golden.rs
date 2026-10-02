use omnileaf_sync_proto::{CategoryId, SeriesId, norm};
use serde::Deserialize;

#[derive(Deserialize)]
struct Golden<V> {
    vectors: Vec<V>,
}

#[expect(
    clippy::unwrap_used,
    reason = "the golden files are committed, so one that does not parse should stop the test"
)]
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
