use rusqlite::Transaction;

use crate::{Error, catalog::RootId};

const MARK_UNAVAILABLE: &str = "UPDATE library_root
    SET unavailable_since_ms = coalesce(unavailable_since_ms, ?2)
    WHERE id = ?1";
const MARK_AVAILABLE: &str = "UPDATE library_root SET unavailable_since_ms = NULL WHERE id = ?1";

/// Keeps the time the root was first found unavailable when it stays away across rescans.
#[tracing::instrument(skip_all, fields(root = %id))]
pub fn mark_root_unavailable(
    transaction: &Transaction<'_>,
    id: RootId,
    since_ms: i64,
) -> Result<(), Error> {
    let marked = transaction
        .prepare(MARK_UNAVAILABLE)?
        .execute((id.0, since_ms))?;
    found_root(marked, id)
}

#[tracing::instrument(skip_all, fields(root = %id))]
pub fn mark_root_available(transaction: &Transaction<'_>, id: RootId) -> Result<(), Error> {
    let marked = transaction.prepare(MARK_AVAILABLE)?.execute([id.0])?;
    found_root(marked, id)
}

fn found_root(rows_changed: usize, id: RootId) -> Result<(), Error> {
    if rows_changed == 0 {
        return Err(Error::UnknownRoot { id });
    }
    Ok(())
}
