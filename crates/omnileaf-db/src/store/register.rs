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
