use std::collections::{BTreeMap, HashMap};

use rusqlite::Transaction;

use crate::{
    Error,
    catalog::{
        native_path,
        root::{RootId, RootLocator, relocate_root, stored_location},
    },
};

/// Moves the roots together, so roots that trade places or follow one another all arrive, skipping any no longer in the library.
/// Returns the roots whose new place a root staying put already holds, which keep their place and take the new bookmark.
#[tracing::instrument(skip_all, fields(roots = moves.len()))]
pub fn relocate_roots(
    transaction: &Transaction<'_>,
    moves: &[(RootId, RootLocator)],
) -> Result<Vec<RootId>, Error> {
    let held = places_held(transaction)?;
    let mut moving: BTreeMap<RootId, &RootLocator> = moves
        .iter()
        .filter(|(id, _)| held.values().any(|holder| holder == id))
        .map(|(id, locator)| (*id, locator))
        .collect();
    let mut staying = Vec::new();
    loop {
        let stuck: Vec<RootId> = moving
            .iter()
            .filter(|(id, locator)| is_stuck(**id, locator, &held, &moving))
            .map(|(id, _)| *id)
            .collect();
        if stuck.is_empty() {
            break;
        }
        for id in &stuck {
            if let Some(locator) = moving.remove(id) {
                staying.push((*id, locator));
            }
        }
    }
    for id in moving.keys() {
        park(transaction, *id)?;
    }
    for (id, locator) in &moving {
        relocate_root(transaction, *id, locator)?;
    }
    for (id, locator) in &staying {
        take_bookmark(transaction, *id, locator)?;
    }
    Ok(staying.into_iter().map(|(id, _)| id).collect())
}

fn places_held(transaction: &Transaction<'_>) -> Result<HashMap<Vec<u8>, RootId>, Error> {
    let mut statement = transaction.prepare("SELECT location, id FROM library_root")?;
    let held = statement
        .query_map([], |row| Ok((row.get(0)?, RootId(row.get(1)?))))?
        .collect::<Result<_, _>>()?;
    Ok(held)
}

fn is_stuck(
    id: RootId,
    locator: &RootLocator,
    held: &HashMap<Vec<u8>, RootId>,
    moving: &BTreeMap<RootId, &RootLocator>,
) -> bool {
    let place = native_path::to_bytes(locator.path());
    let held_by_one_staying = held
        .get(&place)
        .is_some_and(|holder| *holder != id && !moving.contains_key(holder));
    let wanted_by_one_before = moving
        .range(..id)
        .any(|(_, other)| other.path() == locator.path());
    held_by_one_staying || wanted_by_one_before
}

fn park(transaction: &Transaction<'_>, id: RootId) -> Result<(), Error> {
    let parked = format!("\0moving library folder {id}").into_bytes();
    transaction
        .prepare("UPDATE library_root SET location = ?2 WHERE id = ?1")?
        .execute((id.0, parked))?;
    Ok(())
}

fn take_bookmark(
    transaction: &Transaction<'_>,
    id: RootId,
    locator: &RootLocator,
) -> Result<(), Error> {
    let stored = stored_location(locator);
    transaction
        .prepare("UPDATE library_root SET locator_kind = ?2, bookmark = ?3 WHERE id = ?1")?
        .execute((id.0, stored.kind, stored.bookmark))?;
    Ok(())
}
