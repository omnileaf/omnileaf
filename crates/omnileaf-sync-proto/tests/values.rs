use omnileaf_sync_proto::{Value, ValueError};
use proptest::prelude::*;

#[test]
fn refuses_an_integer_written_longer_than_it_needs() {
    let decoded = [
        [0x18, 0x17].as_slice(),
        &[0x19, 0x00, 0xff],
        &[0x1a, 0x00, 0x00, 0xff, 0xff],
    ]
    .map(Value::from_cbor);

    assert_eq!(decoded, [const { Err(ValueError::NotShortest) }; 3]);
}

#[test]
fn refuses_bytes_after_the_value() {
    let decoded = Value::from_cbor(&[0xf5, 0x00, 0x00]);

    assert_eq!(decoded, Err(ValueError::TrailingBytes { count: 2 }));
}

#[test]
fn refuses_an_integer_cut_short() {
    let decoded = [[].as_slice(), &[0x19, 0x01]].map(Value::from_cbor);

    assert_eq!(decoded, [const { Err(ValueError::Truncated) }; 2]);
}

#[test]
fn refuses_a_kind_of_value_this_version_does_not_read() {
    let array = Value::from_cbor(&[0x81, 0x01]);

    assert_eq!(array, Err(ValueError::Unsupported { initial: 0x81 }));
}

#[test]
fn refuses_a_text_written_with_a_longer_length_than_it_needs() {
    let decoded = Value::from_cbor(&[0x78, 0x01, b'a']);

    assert_eq!(decoded, Err(ValueError::NotShortest));
}

#[test]
fn refuses_a_text_cut_short_or_followed_by_more_bytes() {
    let decoded = [
        Value::from_cbor(&[0x63, b'a', b'b']),
        Value::from_cbor(&[0x61, b'a', b'b']),
    ];

    assert_eq!(
        decoded,
        [
            Err(ValueError::Truncated),
            Err(ValueError::TrailingBytes { count: 1 })
        ]
    );
}

#[test]
fn refuses_a_text_that_is_not_utf8() {
    let decoded = Value::from_cbor(&[0x62, 0xc3, 0x28]);

    assert_eq!(decoded, Err(ValueError::NotUtf8));
}

#[test]
fn writes_a_text_as_its_length_then_its_bytes_in_the_shortest_form() {
    let long = "x".repeat(24);

    let written = [
        Value::Text(String::new()).to_cbor(),
        Value::Text("a".to_owned()).to_cbor(),
        Value::Text("é".to_owned()).to_cbor(),
        Value::Text(long).to_cbor(),
    ];

    assert_eq!(
        written,
        [
            vec![0x60],
            vec![0x61, b'a'],
            vec![0x62, 0xc3, 0xa9],
            [vec![0x78, 24], vec![b'x'; 24]].concat()
        ]
    );
}

fn any_value() -> impl Strategy<Value = Value> {
    prop_oneof![
        Just(Value::Null),
        any::<bool>().prop_map(Value::Bool),
        any::<u64>().prop_map(Value::Unsigned),
        ".{0,300}".prop_map(Value::Text),
    ]
}

proptest! {
    #[test]
    fn reads_back_every_value_it_writes(value in any_value()) {
        prop_assert_eq!(Value::from_cbor(&value.to_cbor()), Ok(value));
    }

    #[test]
    fn writes_larger_numbers_no_shorter(smaller: u64, larger: u64) {
        let (smaller, larger) = (smaller.min(larger), smaller.max(larger));

        prop_assert!(
            Value::Unsigned(smaller).to_cbor().len() <= Value::Unsigned(larger).to_cbor().len()
        );
    }
}
