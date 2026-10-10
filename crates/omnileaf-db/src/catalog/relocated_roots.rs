use std::collections::{BTreeMap, HashMap, HashSet};

use rusqlite::Transaction;

use crate::{
    Error,
    catalog::root::{RootId, RootLocator, relocate_root, stored_location},
};

/// Moves the roots together so ones that trade places or follow one another all arrive, returning those kept in place with their new bookmark because a root staying put holds where they were going.
#[tracing::instrument(skip_all, fields(roots = moves.len()))]
pub fn relocate_roots(
    transaction: &Transaction<'_>,
    moves: &[(RootId, RootLocator)],
) -> Result<Vec<RootId>, Error> {
    let held = places_held(transaction)?;
    let in_library: HashSet<RootId> = held.values().copied().collect();
    let mut moving = BTreeMap::new();
    for (id, locator) in moves {
        let place = stored_location(locator).location;
        match held.get(&place) {
            Some(holder) if holder == id => take_bookmark(transaction, *id, locator)?,
            _ if !in_library.contains(id) => {}
            _ => {
                moving.insert(*id, (place, locator));
            }
        }
    }
    let mut staying = Vec::new();
    loop {
        let stuck: Vec<RootId> = moving
            .iter()
            .filter(|(id, (place, _))| is_stuck(**id, place, &held, &moving))
            .map(|(id, _)| *id)
            .collect();
        if stuck.is_empty() {
            break;
        }
        for id in stuck {
            if let Some((_, locator)) = moving.remove(&id) {
                take_bookmark(transaction, id, locator)?;
                staying.push(id);
            }
        }
    }
    for id in moving.keys() {
        park(transaction, *id)?;
    }
    for (id, (_, locator)) in &moving {
        relocate_root(transaction, *id, locator)?;
    }
    Ok(staying)
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
    place: &[u8],
    held: &HashMap<Vec<u8>, RootId>,
    moving: &BTreeMap<RootId, (Vec<u8>, &RootLocator)>,
) -> bool {
    let held_by_one_staying = held
        .get(place)
        .is_some_and(|holder| *holder != id && !moving.contains_key(holder));
    let wanted_by_one_before = moving
        .range(..id)
        .any(|(_, (other, _))| other.as_slice() == place);
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
