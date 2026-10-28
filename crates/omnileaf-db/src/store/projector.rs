use std::collections::{BTreeMap, BTreeSet};

use omnileaf_sync_proto::{BookId, BookmarkId, ProfileId, Value};
use rusqlite::Connection;

use crate::{
    Error,
    store::{
        Changed,
        key::{BookmarkKey, Key, LatestKey, MaximumKey},
        local::current_profile,
    },
};

const REGISTERS_SHOWN_IN_PROFILE: &str = "SELECT entity, id, field, value FROM sync_register
    WHERE profile IN (?1, ?2)";
const PROJECT_BOOK_STATE: &str =
    "INSERT INTO book_state (book_id, position_page, furthest_page, is_read)
    VALUES (?1, ?2, ?3, ?4)";

const BOOKMARK_REGISTERS: &str = "SELECT field, value FROM sync_register
    WHERE entity = 'bookmark' AND id = ?1 AND profile IN (?2, ?3)";
const PROJECT_BOOKMARK: &str =
    "INSERT OR IGNORE INTO book_bookmark (book_id, page) VALUES (?1, ?2)";
const REMOVE_BOOKMARK: &str = "DELETE FROM book_bookmark WHERE book_id = ?1 AND page = ?2";

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

#[derive(Default)]
struct BookmarkRow {
    book_high: Option<u64>,
    book_low: Option<u64>,
    page: Option<u32>,
    deleted: Option<bool>,
}

impl BookmarkRow {
    fn place(&self, id: BookmarkId) -> Option<(BookId, u32)> {
        let mut bytes = [0; 16];
        bytes[..8].copy_from_slice(&self.book_high?.to_be_bytes());
        bytes[8..].copy_from_slice(&self.book_low?.to_be_bytes());
        let book = BookId::try_from(bytes.as_slice()).ok()?;
        let page = self.page?;
        (BookmarkId::of(book, page) == id).then_some((book, page))
    }

    fn is_bookmarked(&self) -> bool {
        self.deleted == Some(false)
    }
}

enum BookmarkPart {
    BookHigh(Option<u64>),
    BookLow(Option<u64>),
    Page(Option<u32>),
    Deleted(Option<bool>),
}

enum Projection {
    Position { book: BookId, page: Option<u32> },
    Furthest { book: BookId, page: Option<u32> },
    Read { book: BookId, is_read: Option<bool> },
    Bookmark { id: BookmarkId, part: BookmarkPart },
}

impl Projection {
    fn of(key: Key, value: &Value) -> Option<Self> {
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
            Key::Bookmark(key) => Self::Bookmark {
                id: key.id(),
                part: match key {
                    BookmarkKey::BookHigh(_) => BookmarkPart::BookHigh(unsigned(value).ok()?),
                    BookmarkKey::BookLow(_) => BookmarkPart::BookLow(unsigned(value).ok()?),
                    BookmarkKey::Page(_) => BookmarkPart::Page(page(value).ok()?),
                    BookmarkKey::Deleted(_) => BookmarkPart::Deleted(flag(value).ok()?),
                },
            },
        })
    }

    const fn book(&self) -> Option<BookId> {
        match *self {
            Self::Position { book, .. } | Self::Furthest { book, .. } | Self::Read { book, .. } => {
                Some(book)
            }
            Self::Bookmark { .. } => None,
        }
    }

    const fn fill(&self, row: &mut BookStateRow) {
        match *self {
            Self::Position { page, .. } => row.position_page = page,
            Self::Furthest { page, .. } => row.furthest_page = page,
            Self::Read { is_read, .. } => row.is_read = is_read,
            Self::Bookmark { .. } => {}
        }
    }

    const fn fill_bookmark(&self, row: &mut BookmarkRow) {
        if let Self::Bookmark { part, .. } = self {
            match *part {
                BookmarkPart::BookHigh(high) => row.book_high = high,
                BookmarkPart::BookLow(low) => row.book_low = low,
                BookmarkPart::Page(page) => row.page = page,
                BookmarkPart::Deleted(deleted) => row.deleted = deleted,
            }
        }
    }

    fn apply(&self, connection: &Connection) -> Result<usize, Error> {
        match *self {
            Self::Position { book, page } => {
                Ok(connection.execute(PROJECT_POSITION, (book.as_bytes(), page))?)
            }
            Self::Furthest { book, page } => {
                Ok(connection.execute(PROJECT_FURTHEST, (book.as_bytes(), page))?)
            }
            Self::Read { book, is_read } => {
                Ok(connection.execute(PROJECT_READ, (book.as_bytes(), is_read))?)
            }
            Self::Bookmark {
                id,
                part: BookmarkPart::Deleted(_),
            } => project_bookmark(connection, id),
            Self::Bookmark { .. } => Ok(0),
        }
    }
}

fn project_bookmark(connection: &Connection, id: BookmarkId) -> Result<usize, Error> {
    let profile = current_profile(connection)?;
    let mut statement = connection.prepare(BOOKMARK_REGISTERS)?;
    let mut registers = statement.query((
        id.as_bytes(),
        profile.as_bytes(),
        ProfileId::shared().as_bytes(),
    ))?;
    let mut row = BookmarkRow::default();
    while let Some(register) = registers.next()? {
        let field: String = register.get(0)?;
        let cbor: Vec<u8> = register.get(1)?;
        let Ok(value) = Value::from_cbor(&cbor) else {
            continue;
        };
        let key = match field.as_str() {
            "book_hi" => BookmarkKey::BookHigh(id),
            "book_lo" => BookmarkKey::BookLow(id),
            "page" => BookmarkKey::Page(id),
            "deleted" => BookmarkKey::Deleted(id),
            _ => continue,
        };
        if let Some(part) = Projection::of(key.into(), &value) {
            part.fill_bookmark(&mut row);
        }
    }
    let Some((book, page)) = row.place(id) else {
        return Ok(0);
    };
    if row.is_bookmarked() {
        Ok(connection.execute(PROJECT_BOOKMARK, (book.as_bytes(), page))?)
    } else {
        Ok(connection.execute(REMOVE_BOOKMARK, (book.as_bytes(), page))?)
    }
}

pub(crate) fn project(connection: &Connection, key: Key, value: &Value) -> Result<(), Error> {
    let projection = Projection::of(key, value).ok_or_else(|| Error::UnexpectedValue {
        key,
        found: value.clone(),
    })?;
    projection.apply(connection)?;
    Ok(())
}

#[tracing::instrument(skip_all)]
pub(crate) fn rebuild(connection: &Connection) -> Result<Changed, Error> {
    connection.execute("DELETE FROM book_state", [])?;
    connection.execute("DELETE FROM book_bookmark", [])?;
    let mut projected = BTreeSet::new();
    let mut rows: BTreeMap<BookId, BookStateRow> = BTreeMap::new();
    let mut bookmarks: BTreeMap<BookmarkId, BookmarkRow> = BTreeMap::new();
    for (key, projection) in shown_projections(connection)? {
        match (projection.book(), key) {
            (Some(book), _) => projection.fill(rows.entry(book).or_default()),
            (None, Key::Bookmark(bookmark)) => {
                projection.fill_bookmark(bookmarks.entry(bookmark.id()).or_default());
            }
            (None, _) => {}
        }
        projected.insert(key);
    }
    let mut bookmark = connection.prepare(PROJECT_BOOKMARK)?;
    for (id, row) in bookmarks.iter().filter(|(_, row)| row.is_bookmarked()) {
        if let Some((book, page)) = row.place(*id) {
            bookmark.execute((book.as_bytes(), page))?;
        }
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
    let Some(projection) = Projection::of(key, &value) else {
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

fn page(value: &Value) -> Result<Option<u32>, OtherKind> {
    match value {
        Value::Null => Ok(None),
        Value::Unsigned(page) => u32::try_from(*page).map(Some).map_err(|_| OtherKind),
        Value::Bool(_) | Value::Text(_) => Err(OtherKind),
    }
}

fn unsigned(value: &Value) -> Result<Option<u64>, OtherKind> {
    match value {
        Value::Null => Ok(None),
        Value::Unsigned(number) => Ok(Some(*number)),
        Value::Bool(_) | Value::Text(_) => Err(OtherKind),
    }
}

fn flag(value: &Value) -> Result<Option<bool>, OtherKind> {
    match value {
        Value::Null => Ok(None),
        Value::Bool(flag) => Ok(Some(*flag)),
        Value::Unsigned(_) | Value::Text(_) => Err(OtherKind),
    }
}
