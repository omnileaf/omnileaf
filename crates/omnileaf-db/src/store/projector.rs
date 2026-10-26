use std::collections::{BTreeMap, BTreeSet};

use omnileaf_sync_proto::{BookId, ProfileId, Value};
use rusqlite::Connection;

use crate::{
    Error,
    store::{
        Changed,
        key::{Key, LatestKey, MaximumKey},
        local::current_profile,
    },
};

const REGISTERS_SHOWN_IN_PROFILE: &str = "SELECT entity, id, field, value FROM sync_register
    WHERE profile IN (?1, ?2)";
const PROJECT_BOOK_STATE: &str =
    "INSERT INTO book_state (book_id, position_page, furthest_page, is_read)
    VALUES (?1, ?2, ?3, ?4)";

const PROJECT_POSITION: &str = "INSERT INTO book_state (book_id, position_page) VALUES (?1, ?2)
    ON CONFLICT (book_id) DO UPDATE SET position_page = excluded.position_page";
const PROJECT_FURTHEST: &str = "INSERT INTO book_state (book_id, furthest_page) VALUES (?1, ?2)
    ON CONFLICT (book_id) DO UPDATE SET furthest_page = excluded.furthest_page";
const PROJECT_READ: &str = "INSERT INTO book_state (book_id, is_read) VALUES (?1, ?2)
    ON CONFLICT (book_id) DO UPDATE SET is_read = excluded.is_read";

#[derive(Default)]
struct BookStateRow {
    position_page: Option<u32>,
    furthest_page: Option<u32>,
    is_read: Option<bool>,
}

enum Projection {
    Position { book: BookId, page: Option<u32> },
    Furthest { book: BookId, page: Option<u32> },
    Read { book: BookId, is_read: Option<bool> },
}

impl Projection {
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

    const fn book(&self) -> BookId {
        match *self {
            Self::Position { book, .. } | Self::Furthest { book, .. } | Self::Read { book, .. } => {
                book
            }
        }
    }

    const fn fill(&self, row: &mut BookStateRow) {
        match *self {
            Self::Position { page, .. } => row.position_page = page,
            Self::Furthest { page, .. } => row.furthest_page = page,
            Self::Read { is_read, .. } => row.is_read = is_read,
        }
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

#[tracing::instrument(skip_all)]
pub(crate) fn rebuild(connection: &Connection) -> Result<Changed, Error> {
    connection.execute("DELETE FROM book_state", [])?;
    let mut projected = BTreeSet::new();
    let mut rows: BTreeMap<BookId, BookStateRow> = BTreeMap::new();
    for (key, projection) in shown_projections(connection)? {
        projection.fill(rows.entry(projection.book()).or_default());
        projected.insert(key);
    }
    let mut insert = connection.prepare(PROJECT_BOOK_STATE)?;
    for (book, row) in rows {
        insert.execute((
            book.as_bytes(),
            row.position_page,
            row.furthest_page,
            row.is_read,
        ))?;
    }
    tracing::info!(
        registers = projected.len(),
        "rebuilt the projections from the registers"
    );
    Ok(Changed::Registers {
        keys: projected,
        recounted: true,
    })
}

pub(crate) fn shown_keys(connection: &Connection) -> Result<BTreeSet<Key>, Error> {
    Ok(shown_projections(connection)?
        .into_iter()
        .map(|(key, _)| key)
        .collect())
}

fn shown_projections(connection: &Connection) -> Result<Vec<(Key, Projection)>, Error> {
    let profile = current_profile(connection)?;
    let mut statement = connection.prepare(REGISTERS_SHOWN_IN_PROFILE)?;
    let mut registers = statement.query([profile.as_bytes(), ProfileId::shared().as_bytes()])?;
    let mut shown = Vec::new();
    while let Some(register) = registers.next()? {
        let entity: String = register.get(0)?;
        let id: Vec<u8> = register.get(1)?;
        let field: String = register.get(2)?;
        let value: Vec<u8> = register.get(3)?;
        shown.extend(projectable(&entity, &id, &field, &value));
    }
    Ok(shown)
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
