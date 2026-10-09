use rusqlite::{OptionalExtension, Transaction};

use crate::{
    Error,
    catalog::root::{RootId, RootKind, RootLocator, forget_root, relocate_root, stored_location},
};

/// Points the one home root at `locator` and keeps its id, so a moved home folder never lingers as a second home.
/// A linked root already at `locator` becomes the home instead, and the old home goes with the books found only in it.
#[tracing::instrument(skip_all)]
pub fn set_home_root(
    transaction: &Transaction<'_>,
    locator: &RootLocator,
    added_at_ms: i64,
) -> Result<RootId, Error> {
    let stored = stored_location(locator);
    let home: Option<RootId> = transaction
        .prepare("SELECT id FROM library_root WHERE kind = ?1")?
        .query_row([RootKind::Home], |row| Ok(RootId(row.get(0)?)))
        .optional()?;
    let already_there: Option<(RootId, RootKind)> = transaction
        .prepare("SELECT id, kind FROM library_root WHERE location = ?1")?
        .query_row([&stored.location], |row| {
            Ok((RootId(row.get(0)?), row.get(1)?))
        })
        .optional()?;
    match (home, already_there) {
        (_, Some((id, RootKind::Home))) => Ok(id),
        (old_home, Some((linked, RootKind::Linked))) => {
            if let Some(old_home) = old_home {
                forget_root(transaction, old_home)?;
            }
            transaction
                .prepare("UPDATE library_root SET kind = ?2 WHERE id = ?1")?
                .execute((linked.0, RootKind::Home))?;
            relocate_root(transaction, linked, locator)?;
            Ok(linked)
        }
        (Some(home), None) => {
            relocate_root(transaction, home, locator)?;
            Ok(home)
        }
        (None, None) => Ok(RootId(
            transaction
                .prepare(
                    "INSERT INTO library_root (kind, locator_kind, location, bookmark, added_at_ms)
                     VALUES (?1, ?2, ?3, ?4, ?5)
                     RETURNING id",
                )?
                .query_row(
                    (
                        RootKind::Home,
                        stored.kind,
                        &stored.location,
                        stored.bookmark,
                        added_at_ms,
                    ),
                    |row| row.get(0),
                )?,
        )),
    }
}
