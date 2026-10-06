use std::collections::BTreeSet;

use omnileaf_sync_proto::{BookId, Value};
use rusqlite::Connection;

use crate::{
    Error,
    store::{
        Changed,
        key::{Key, LatestKey, MaximumKey},
    },
};

const PROJECT_POSITION: &str = "INSERT INTO book_state (book_id, position_page) VALUES (?1, ?2)
    ON CONFLICT (book_id) DO UPDATE SET position_page = excluded.position_page";
const PROJECT_FURTHEST: &str = "INSERT INTO book_state (book_id, furthest_page) VALUES (?1, ?2)
    ON CONFLICT (book_id) DO UPDATE SET furthest_page = excluded.furthest_page";
const PROJECT_READ: &str = "INSERT INTO book_state (book_id, is_read) VALUES (?1, ?2)
    ON CONFLICT (book_id) DO UPDATE SET is_read = excluded.is_read";

/// The columns one register feeds, set from its current value alone so replaying the registers in any order rebuilds the same rows.
enum Projection {
    Position { book: BookId, page: Option<u32> },
    Furthest { book: BookId, page: Option<u32> },
    Read { book: BookId, is_read: Option<bool> },
}

impl Projection {
    /// None when the value is not the kind the key's field holds.
    fn of(key: Key, value: Value) -> Option<Self> {
        Some(match key {
            Key::Latest(LatestKey::BookPosition(book)) => Self::Position {
                book,
                page: page(value).ok()?,
            },
            Key::Maximum(MaximumKey::BookFurthest(book)) => Self::Furthest {
                book,
                page: page(value).ok()?,
            },
            Key::Latest(LatestKey::BookRead(book)) => Self::Read {
                book,
                is_read: flag(value).ok()?,
            },
        })
    }

    fn apply(&self, connection: &Connection) -> rusqlite::Result<usize> {
        match *self {
            Self::Position { book, page } => {
                connection.execute(PROJECT_POSITION, (book.as_bytes(), page))
            }
            Self::Furthest { book, page } => {
                connection.execute(PROJECT_FURTHEST, (book.as_bytes(), page))
            }
            Self::Read { book, is_read } => {
                connection.execute(PROJECT_READ, (book.as_bytes(), is_read))
            }
        }
    }
}

pub(crate) fn project(connection: &Connection, key: Key, value: Value) -> Result<(), Error> {
    let projection =
        Projection::of(key, value).ok_or(Error::UnexpectedValue { key, found: value })?;
    projection.apply(connection)?;
    Ok(())
}

/// Leaves out, with a warning, every register this version cannot project, so one bad register never blocks the rest.
#[tracing::instrument(skip_all)]
pub(crate) fn rebuild(connection: &Connection) -> Result<Changed, Error> {
    connection.execute("DELETE FROM book_state", [])?;
    let mut statement = connection.prepare("SELECT entity, id, field, value FROM sync_register")?;
    let mut registers = statement.query([])?;
    let mut projected = BTreeSet::new();
    while let Some(register) = registers.next()? {
        let entity: String = register.get(0)?;
        let id: Vec<u8> = register.get(1)?;
        let field: String = register.get(2)?;
        let value: Vec<u8> = register.get(3)?;
        if let Some((key, projection)) = projectable(&entity, &id, &field, &value) {
            projection.apply(connection)?;
            projected.insert(key);
        }
    }
    tracing::info!(
        registers = projected.len(),
        "rebuilt the projections from the registers"
    );
    Ok(Changed { keys: projected })
}

fn projectable(entity: &str, id: &[u8], field: &str, cbor: &[u8]) -> Option<(Key, Projection)> {
    let key = match Key::stored(entity, id, field) {
        Ok(key) => key?,
        Err(error) => {
            tracing::warn!(entity, field, error = %error, "left out a synced register whose id is not an entity id");
            return None;
        }
    };
    let value = match Value::from_cbor(cbor) {
        Ok(value) => value,
        Err(error) => {
            tracing::warn!(?key, error = %error, "left out a synced register whose value is unreadable");
            return None;
        }
    };
    let Some(projection) = Projection::of(key, value) else {
        tracing::warn!(
            ?key,
            ?value,
            "left out a synced register holding a value its field cannot"
        );
        return None;
    };
    Some((key, projection))
}

struct OtherKind;

fn page(value: Value) -> Result<Option<u32>, OtherKind> {
    match value {
        Value::Null => Ok(None),
        Value::Unsigned(page) => u32::try_from(page).map(Some).map_err(|_| OtherKind),
        Value::Bool(_) => Err(OtherKind),
    }
}

fn flag(value: Value) -> Result<Option<bool>, OtherKind> {
    match value {
        Value::Null => Ok(None),
        Value::Bool(flag) => Ok(Some(flag)),
        Value::Unsigned(_) => Err(OtherKind),
    }
}
