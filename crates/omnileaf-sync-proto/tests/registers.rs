use omnileaf_sync_proto::{Hlc, MergeClass, NodeId, NodeIdLength, Register, Stamp, Value};
use proptest::{collection::vec, prelude::*, sample::subsequence};

const NODE_A: [u8; 16] = [0xa0; 16];
const NODE_B: [u8; 16] = [0xb0; 16];

fn write(class: MergeClass, hlc: u64, node: [u8; 16], value: u64) -> Register {
    Register {
        class,
        stamp: Stamp {
            hlc: Hlc::from(hlc),
            node: NodeId::from(node),
        },
        value: Value::Unsigned(value).to_cbor(),
    }
}

#[test]
fn reads_back_a_node_id_from_its_bytes() {
    let node = NodeId::from(NODE_A);

    let read = NodeId::try_from(node.as_bytes().as_slice());

    assert_eq!(read, Ok(node));
}

#[test]
fn refuses_a_node_id_of_the_wrong_length() {
    let read = NodeId::try_from([0xa0; 15].as_slice());

    assert_eq!(read, Err(NodeIdLength { length: 15 }));
}

#[test]
fn keeps_the_later_of_two_last_writer_wins_writes() {
    let earlier = write(MergeClass::LastWriterWins, 10, NODE_B, 9);
    let later = write(MergeClass::LastWriterWins, 11, NODE_A, 1);

    let kept = [
        earlier.clone().merge(later.clone()),
        later.clone().merge(earlier),
    ];

    assert_eq!(kept, [later.clone(), later]);
}

#[test]
fn keeps_the_write_from_the_greater_node_when_the_clocks_agree() {
    let from_a = write(MergeClass::LastWriterWins, 10, NODE_A, 1);
    let from_b = write(MergeClass::LastWriterWins, 10, NODE_B, 2);

    let kept = from_a.merge(from_b.clone());

    assert_eq!(kept, from_b);
}

#[test]
fn keeps_the_higher_rank_of_a_maximum_even_when_it_was_written_earlier() {
    let further = write(MergeClass::Maximum { rank: 40 }, 10, NODE_A, 40);
    let later = write(MergeClass::Maximum { rank: 12 }, 99, NODE_B, 12);

    let kept = later.merge(further.clone());

    assert_eq!(kept, further);
}

#[test]
fn keeps_the_later_write_of_a_maximum_at_the_same_rank() {
    let earlier = write(MergeClass::Maximum { rank: 40 }, 10, NODE_B, 1);
    let later = write(MergeClass::Maximum { rank: 40 }, 11, NODE_A, 2);

    let kept = later.clone().merge(earlier);

    assert_eq!(kept, later);
}

fn any_register() -> impl Strategy<Value = Register> {
    let class = prop_oneof![
        Just(MergeClass::LastWriterWins),
        (0..3_u32).prop_map(|rank| MergeClass::Maximum { rank }),
    ];
    (
        class,
        0..3_u64,
        prop_oneof![Just(NODE_A), Just(NODE_B)],
        0..3_u64,
    )
        .prop_map(|(class, hlc, node, value)| write(class, hlc, node, value))
}

/// The writes alongside the same writes, some of them twice, in a shuffled order.
fn redelivered(writes: Vec<Register>) -> impl Strategy<Value = (Vec<Register>, Vec<Register>)> {
    let count = writes.len();
    subsequence(writes.clone(), 0..=count).prop_flat_map(move |repeats| {
        let delivered: Vec<Register> = writes.iter().cloned().chain(repeats).collect();
        (Just(writes.clone()), Just(delivered).prop_shuffle())
    })
}

fn fold(registers: Vec<Register>) -> Option<Register> {
    registers.into_iter().reduce(Register::merge)
}

proptest! {
    #[test]
    fn merging_is_commutative(left in any_register(), right in any_register()) {
        prop_assert_eq!(left.clone().merge(right.clone()), right.merge(left));
    }

    #[test]
    fn merging_is_associative(
        first in any_register(),
        second in any_register(),
        third in any_register(),
    ) {
        let grouped_left = first.clone().merge(second.clone()).merge(third.clone());

        let grouped_right = first.merge(second.merge(third));

        prop_assert_eq!(grouped_left, grouped_right);
    }

    #[test]
    fn merging_is_idempotent(register in any_register()) {
        prop_assert_eq!(register.clone().merge(register.clone()), register);
    }

    #[test]
    fn every_order_and_repeat_of_the_same_writes_keeps_the_same_register(
        (writes, delivered) in vec(any_register(), 1..8).prop_flat_map(redelivered)
    ) {
        prop_assert_eq!(fold(delivered), fold(writes));
    }
}
