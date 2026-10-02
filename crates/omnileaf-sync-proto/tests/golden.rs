use omnileaf_sync_proto::norm;
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
