use omnileaf_sync_proto::{MergeClass, Register};
use rusqlite::Connection;

use crate::{Error, store::key::Address};

const LAST_WRITER_WINS: &str = "lww";
const MAXIMUM: &str = "max";

/// Orders the stored and the new write exactly as [`Register::merge`] does: class and rank, clock, node, then value bytes.
const UPSERT: &str =
    "INSERT INTO sync_register (entity, id, field, class, hlc, node, seq, rank, value)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
    ON CONFLICT (entity, id, field) DO UPDATE SET
        class = excluded.class, hlc = excluded.hlc, node = excluded.node, seq = excluded.seq,
        rank = excluded.rank, value = excluded.value, ext = excluded.ext
    WHERE (excluded.class = 'max', coalesce(excluded.rank, 0), excluded.hlc, excluded.node,
            excluded.value)
        > (class = 'max', coalesce(rank, 0), hlc, node, value)";

/// Keeps whichever of the stored write and this one the merge rule prefers, returning whether this one won.
pub(crate) fn upsert(
    connection: &Connection,
    address: &Address,
    register: &Register,
    seq: u64,
) -> Result<bool, Error> {
    let (class, rank) = match register.class {
        MergeClass::LastWriterWins => (LAST_WRITER_WINS, None),
        MergeClass::Maximum { rank } => (MAXIMUM, Some(rank)),
    };
    let changed = connection.prepare(UPSERT)?.execute((
        address.entity,
        address.id,
        address.field,
        class,
        register.stamp.hlc.as_u64(),
        register.stamp.node.as_bytes(),
        seq,
        rank,
        &register.value,
    ))?;
    Ok(changed > 0)
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use omnileaf_sync_proto::{Hlc, NodeId, Stamp};
    use proptest::{collection::vec, prelude::*, sample::subsequence};

    use super::*;
    use crate::migration::{self, MIGRATIONS};

    const ADDRESS: Address = Address {
        entity: "book",
        id: [0x11; 16],
        field: "max",
    };

    fn migrated() -> Connection {
        let mut connection = Connection::open_in_memory().unwrap();
        migration::apply(&mut connection, Path::new(":memory:"), MIGRATIONS).unwrap();
        connection
    }

    fn stored(connection: &Connection) -> Register {
        connection
            .query_row(
                "SELECT rank, hlc, node, value FROM sync_register",
                [],
                |row| {
                    let class = row
                        .get::<_, Option<u32>>(0)?
                        .map_or(MergeClass::LastWriterWins, |rank| MergeClass::Maximum {
                            rank,
                        });
                    let stamp = Stamp {
                        hlc: Hlc::from(row.get::<_, u64>(1)?),
                        node: NodeId::from(row.get::<_, [u8; 16]>(2)?),
                    };
                    Ok(Register {
                        class,
                        stamp,
                        value: row.get(3)?,
                    })
                },
            )
            .unwrap()
    }

    fn any_register() -> impl Strategy<Value = Register> {
        let class = prop_oneof![
            Just(MergeClass::LastWriterWins),
            (0..3_u32).prop_map(|rank| MergeClass::Maximum { rank }),
        ];
        let node = prop_oneof![Just([0xa0; 16]), Just([0xb0; 16])];
        (class, 0..3_u64, node, vec(0..2_u8, 0..3)).prop_map(|(class, hlc, node, value)| Register {
            class,
            stamp: Stamp {
                hlc: Hlc::from(hlc),
                node: NodeId::from(node),
            },
            value,
        })
    }

    /// The writes alongside the same writes, some of them twice, in a shuffled order.
    fn redelivered(writes: Vec<Register>) -> impl Strategy<Value = (Vec<Register>, Vec<Register>)> {
        let count = writes.len();
        subsequence(writes.clone(), 0..=count).prop_flat_map(move |repeats| {
            let delivered: Vec<Register> = writes.iter().cloned().chain(repeats).collect();
            (Just(writes.clone()), Just(delivered).prop_shuffle())
        })
    }

    proptest! {
        #[test]
        fn keeps_what_the_merge_rule_keeps_in_any_order_and_with_repeats(
            (writes, delivered) in vec(any_register(), 1..8).prop_flat_map(redelivered)
        ) {
            let connection = migrated();

            let mut merged: Option<Register> = None;
            for register in delivered {
                let won = upsert(&connection, &ADDRESS, &register, 1).unwrap();
                let kept = merged.clone().map_or(register.clone(), |kept| kept.merge(register));
                prop_assert_eq!(won, merged.as_ref() != Some(&kept));
                merged = Some(kept);
            }

            prop_assert_eq!(Some(stored(&connection)), writes.into_iter().reduce(Register::merge));
        }
    }
}
