use omnileaf_sync_proto::Value;
use rusqlite::Connection;

use crate::{
    Error,
    store::key::{Key, LatestKey, MaximumKey},
};

const PROJECT_POSITION: &str = "INSERT INTO book_state (book_id, position_page) VALUES (?1, ?2)
    ON CONFLICT (book_id) DO UPDATE SET position_page = excluded.position_page";
const PROJECT_FURTHEST: &str = "INSERT INTO book_state (book_id, furthest_page) VALUES (?1, ?2)
    ON CONFLICT (book_id) DO UPDATE SET furthest_page = excluded.furthest_page";
const PROJECT_READ: &str = "INSERT INTO book_state (book_id, is_read) VALUES (?1, ?2)
    ON CONFLICT (book_id) DO UPDATE SET is_read = excluded.is_read";

/// Sets the columns a register feeds from its current value alone, so replaying the registers in any order rebuilds the same rows.
pub(crate) fn project(connection: &Connection, key: Key, cbor: &[u8]) -> Result<(), Error> {
    let value = Value::from_cbor(cbor)?;
    match key {
        Key::Latest(LatestKey::BookPosition(book)) => {
            connection.execute(PROJECT_POSITION, (book.as_bytes(), page(key, value)?))
        }
        Key::Latest(LatestKey::BookRead(book)) => {
            connection.execute(PROJECT_READ, (book.as_bytes(), flag(key, value)?))
        }
        Key::Maximum(MaximumKey::BookFurthest(book)) => {
            connection.execute(PROJECT_FURTHEST, (book.as_bytes(), page(key, value)?))
        }
    }?;
    Ok(())
}

fn page(key: Key, value: Value) -> Result<Option<u64>, Error> {
    match value {
        Value::Null => Ok(None),
        Value::Unsigned(page) => Ok(Some(page)),
        Value::Bool(_) => Err(Error::UnexpectedValue { key, found: value }),
    }
}

fn flag(key: Key, value: Value) -> Result<Option<bool>, Error> {
    match value {
        Value::Null => Ok(None),
        Value::Bool(flag) => Ok(Some(flag)),
        Value::Unsigned(_) => Err(Error::UnexpectedValue { key, found: value }),
    }
}
