use rusqlite::Transaction;

use crate::{Error, catalog::RootId};

const MARK_UNAVAILABLE: &str = "UPDATE library_root
    SET unavailable_since_ms = coalesce(unavailable_since_ms, ?2)
    WHERE id = ?1";
const MARK_AVAILABLE: &str = "UPDATE library_root
    SET unavailable_since_ms = NULL, shows_while_missing = 0
    WHERE id = ?1";
const SHOW_WHILE_MISSING: &str = "UPDATE library_root SET shows_while_missing = ?2 WHERE id = ?1";

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

/// Lists the series of a missing folder again, or hides them, until the folder comes back.
#[tracing::instrument(skip_all, fields(root = %id))]
pub fn show_root_while_missing(
    transaction: &Transaction<'_>,
    id: RootId,
    is_shown: bool,
) -> Result<(), Error> {
    let marked = transaction
        .prepare(SHOW_WHILE_MISSING)?
        .execute((id.0, is_shown))?;
    found_root(marked, id)
}

fn found_root(rows_changed: usize, id: RootId) -> Result<(), Error> {
    if rows_changed == 0 {
        return Err(Error::UnknownRoot { id });
    }
    Ok(())
}
