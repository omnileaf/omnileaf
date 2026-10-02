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
    let text = Value::from_cbor(&[0x61, 0x61]);

    assert_eq!(text, Err(ValueError::Unsupported { initial: 0x61 }));
}

fn any_value() -> impl Strategy<Value = Value> {
    prop_oneof![
        Just(Value::Null),
        any::<bool>().prop_map(Value::Bool),
        any::<u64>().prop_map(Value::Unsigned),
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
