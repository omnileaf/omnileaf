use std::collections::BTreeMap;

use rusqlite::{Connection, OptionalExtension, Transaction};

use crate::{Error, catalog::RootId};

const REMEMBER: &str = "INSERT INTO library_root_share (root_id, address) VALUES (?1, ?2)
    ON CONFLICT (root_id) DO UPDATE SET address = excluded.address";
const FORGET: &str = "DELETE FROM library_root_share WHERE root_id = ?1";
const EVERY_SHARE: &str = "SELECT root_id, address FROM library_root_share";
const ONE_SHARE: &str = "SELECT address FROM library_root_share WHERE root_id = ?1";

#[tracing::instrument(skip_all, fields(root = %id, is_on_a_share = address.is_some()))]
pub fn remember_root_share(
    transaction: &Transaction<'_>,
    id: RootId,
    address: Option<&str>,
) -> Result<(), Error> {
    match address {
        Some(address) => transaction.prepare(REMEMBER)?.execute((id.0, address))?,
        None => transaction.prepare(FORGET)?.execute([id.0])?,
    };
    Ok(())
}

pub fn root_shares(connection: &Connection) -> Result<BTreeMap<RootId, String>, Error> {
    Ok(connection
        .prepare(EVERY_SHARE)?
        .query_map([], |row| Ok((RootId(row.get(0)?), row.get(1)?)))?
        .collect::<Result<_, _>>()?)
}

pub fn root_share(connection: &Connection, id: RootId) -> Result<Option<String>, Error> {
    Ok(connection
        .prepare(ONE_SHARE)?
        .query_row([id.0], |row| row.get(0))
        .optional()?)
}
