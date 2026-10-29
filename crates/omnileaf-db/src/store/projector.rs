use std::collections::{BTreeMap, BTreeSet};

use omnileaf_sync_proto::{
    BookId, BookmarkId, CategoryId, ProfileId, SeriesId, TagId, Value, norm,
};
use rusqlite::Connection;

use crate::catalog::stored_id::stored_id;
use crate::{
    Error,
    store::{
        Changed,
        key::{BookmarkKey, Key, LabelKey, LatestKey, MaximumKey, RemovalKey, SeriesEditKey},
        local::current_profile,
        series_edit::{EditedPerson, SeriesEdits, decode_people, decode_tags},
    },
    title_key::TitleCollation,
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

const PROJECT_REMOVED: &str = "INSERT OR IGNORE INTO book_removed (book_id) VALUES (?1)";
const REMOVE_REMOVED: &str = "DELETE FROM book_removed WHERE book_id = ?1";

const NAMED_REGISTERS: &str = "SELECT field, value FROM sync_register
    WHERE entity = ?1 AND id = ?2 AND profile IN (?3, ?4)";
const PROJECT_CATEGORY: &str =
    "INSERT INTO category (category_id, name, position) VALUES (?1, ?2, ?3)
    ON CONFLICT (category_id) DO UPDATE SET name = excluded.name, position = excluded.position";
const REMOVE_CATEGORY: &str = "DELETE FROM category WHERE category_id = ?1";
const PROJECT_TAG: &str = "INSERT INTO label_tag (tag_id, name, norm_name) VALUES (?1, ?2, ?3)
    ON CONFLICT (tag_id) DO UPDATE SET name = excluded.name, norm_name = excluded.norm_name";
const REMOVE_TAG: &str = "DELETE FROM label_tag WHERE tag_id = ?1";
const PROJECT_SERIES_CATEGORY: &str =
    "INSERT OR IGNORE INTO series_category (series_id, category_id) VALUES (?1, ?2)";
const REMOVE_SERIES_CATEGORY: &str =
    "DELETE FROM series_category WHERE series_id = ?1 AND category_id = ?2";
const PROJECT_SERIES_TAG: &str =
    "INSERT OR IGNORE INTO series_label_tag (series_id, tag_id) VALUES (?1, ?2)";
const REMOVE_SERIES_TAG: &str = "DELETE FROM series_label_tag WHERE series_id = ?1 AND tag_id = ?2";
const CLEAR_LABELS: [&str; 4] = [
    "DELETE FROM category",
    "DELETE FROM label_tag",
    "DELETE FROM series_category",
    "DELETE FROM series_label_tag",
];
const SERIES_EDIT_REGISTERS: &str = "SELECT field, value FROM sync_register
    WHERE entity = 'series' AND id = ?1 AND profile = ?2 AND field LIKE 'meta.%'";
const PROJECT_SERIES_EDIT: &str = "INSERT INTO series_edit
    (series_id, title, title_key, summary, is_adult, has_people, has_tags)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)";
const PROJECT_EDITED_PERSON: &str = "INSERT INTO series_edit_person
    (series_id, position, role, name, name_key) VALUES (?1, ?2, ?3, ?4, ?5)";
const PROJECT_EDITED_TAG: &str =
    "INSERT INTO series_edit_tag (series_id, position, name) VALUES (?1, ?2, ?3)";
const REMOVE_SERIES_EDIT: [&str; 3] = [
    "DELETE FROM series_edit WHERE series_id = ?1",
    "DELETE FROM series_edit_person WHERE series_id = ?1",
    "DELETE FROM series_edit_tag WHERE series_id = ?1",
];
const CLEAR_SERIES_EDITS: [&str; 3] = [
    "DELETE FROM series_edit",
    "DELETE FROM series_edit_person",
    "DELETE FROM series_edit_tag",
];
const NO_ROLE: &str = "";
const LAST_POSITION: i64 = i64::MAX;

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

#[derive(Default)]
struct NamedRow {
    name: Option<String>,
    order: Option<u64>,
    deleted: Option<bool>,
}

impl NamedRow {
    fn shown_name(&self) -> Option<&str> {
        if self.deleted == Some(true) {
            return None;
        }
        self.name.as_deref()
    }

    fn position(&self) -> i64 {
        self.order
            .and_then(|order| i64::try_from(order).ok())
            .unwrap_or(LAST_POSITION)
    }
}

enum NamedPart {
    Name(Option<String>),
    Order(Option<u64>),
    Deleted(Option<bool>),
}

impl NamedPart {
    fn fill(self, row: &mut NamedRow) {
        match self {
            Self::Name(name) => row.name = name,
            Self::Order(order) => row.order = order,
            Self::Deleted(deleted) => row.deleted = deleted,
        }
    }
}

enum LabelProjection {
    Category {
        id: CategoryId,
        part: NamedPart,
    },
    Tag {
        id: TagId,
        part: NamedPart,
    },
    InCategory {
        series: SeriesId,
        category: CategoryId,
        is_member: Option<bool>,
    },
    WithTag {
        series: SeriesId,
        tag: TagId,
        is_member: Option<bool>,
    },
}

impl LabelProjection {
    fn of(key: LabelKey, value: &Value) -> Option<Self> {
        Some(match key {
            LabelKey::CategoryName(id) => Self::Category {
                id,
                part: NamedPart::Name(text(value).ok()?),
            },
            LabelKey::CategoryOrder(id) => Self::Category {
                id,
                part: NamedPart::Order(unsigned(value).ok()?),
            },
            LabelKey::CategoryDeleted(id) => Self::Category {
                id,
                part: NamedPart::Deleted(flag(value).ok()?),
            },
            LabelKey::TagName(id) => Self::Tag {
                id,
                part: NamedPart::Name(text(value).ok()?),
            },
            LabelKey::TagDeleted(id) => Self::Tag {
                id,
                part: NamedPart::Deleted(flag(value).ok()?),
            },
            LabelKey::SeriesCategory { series, category } => Self::InCategory {
                series,
                category,
                is_member: flag(value).ok()?,
            },
            LabelKey::SeriesTag { series, tag } => Self::WithTag {
                series,
                tag,
                is_member: flag(value).ok()?,
            },
        })
    }

    fn apply(&self, connection: &Connection) -> Result<(), Error> {
        match *self {
            Self::Category { id, .. } => project_category(connection, id),
            Self::Tag { id, .. } => project_tag(connection, id),
            Self::InCategory {
                series,
                category,
                is_member,
            } => set_membership(
                connection,
                is_member == Some(true),
                (PROJECT_SERIES_CATEGORY, REMOVE_SERIES_CATEGORY),
                (series.as_bytes(), category.as_bytes()),
            ),
            Self::WithTag {
                series,
                tag,
                is_member,
            } => set_membership(
                connection,
                is_member == Some(true),
                (PROJECT_SERIES_TAG, REMOVE_SERIES_TAG),
                (series.as_bytes(), tag.as_bytes()),
            ),
        }
    }
}

fn set_membership(
    connection: &Connection,
    is_member: bool,
    (add, remove): (&str, &str),
    (series, label): (&[u8; 16], &[u8; 16]),
) -> Result<(), Error> {
    let statement = if is_member { add } else { remove };
    connection.execute(statement, (series, label))?;
    Ok(())
}

#[cfg(test)]
pub(crate) fn set_category_membership(
    connection: &Connection,
    series: SeriesId,
    category: CategoryId,
    is_member: bool,
) -> Result<(), Error> {
    set_membership(
        connection,
        is_member,
        (PROJECT_SERIES_CATEGORY, REMOVE_SERIES_CATEGORY),
        (series.as_bytes(), category.as_bytes()),
    )
}

fn named_row(
    connection: &Connection,
    entity: &str,
    id: &[u8; 16],
    key_of: impl Fn(&str) -> Option<LabelKey>,
) -> Result<NamedRow, Error> {
    let profile = current_profile(connection)?;
    let mut statement = connection.prepare(NAMED_REGISTERS)?;
    let mut registers = statement.query((
        entity,
        id,
        profile.as_bytes(),
        ProfileId::shared().as_bytes(),
    ))?;
    let mut row = NamedRow::default();
    while let Some(register) = registers.next()? {
        let field: String = register.get(0)?;
        let cbor: Vec<u8> = register.get(1)?;
        let (Some(key), Ok(value)) = (key_of(&field), Value::from_cbor(&cbor)) else {
            continue;
        };
        if let Some(LabelProjection::Category { part, .. } | LabelProjection::Tag { part, .. }) =
            LabelProjection::of(key, &value)
        {
            part.fill(&mut row);
        }
    }
    Ok(row)
}

fn project_category(connection: &Connection, id: CategoryId) -> Result<(), Error> {
    let row = named_row(connection, "category", id.as_bytes(), |field| match field {
        "name" => Some(LabelKey::CategoryName(id)),
        "order" => Some(LabelKey::CategoryOrder(id)),
        "deleted" => Some(LabelKey::CategoryDeleted(id)),
        _ => None,
    })?;
    match row.shown_name() {
        Some(name) => {
            connection.execute(PROJECT_CATEGORY, (id.as_bytes(), name, row.position()))?
        }
        None => connection.execute(REMOVE_CATEGORY, [id.as_bytes()])?,
    };
    Ok(())
}

fn project_tag(connection: &Connection, id: TagId) -> Result<(), Error> {
    let row = named_row(connection, "tag", id.as_bytes(), |field| match field {
        "name" => Some(LabelKey::TagName(id)),
        "deleted" => Some(LabelKey::TagDeleted(id)),
        _ => None,
    })?;
    match row.shown_name() {
        Some(name) => connection.execute(PROJECT_TAG, (id.as_bytes(), name, norm(name)))?,
        None => connection.execute(REMOVE_TAG, [id.as_bytes()])?,
    };
    Ok(())
}

#[derive(Default)]
struct LabelRows {
    categories: BTreeMap<CategoryId, NamedRow>,
    tags: BTreeMap<TagId, NamedRow>,
    in_category: BTreeSet<(SeriesId, CategoryId)>,
    with_tag: BTreeSet<(SeriesId, TagId)>,
}

impl LabelRows {
    fn take(&mut self, label: LabelProjection) {
        match label {
            LabelProjection::Category { id, part } => {
                part.fill(self.categories.entry(id).or_default());
            }
            LabelProjection::Tag { id, part } => part.fill(self.tags.entry(id).or_default()),
            LabelProjection::InCategory {
                series,
                category,
                is_member: Some(true),
            } => {
                self.in_category.insert((series, category));
            }
            LabelProjection::WithTag {
                series,
                tag,
                is_member: Some(true),
            } => {
                self.with_tag.insert((series, tag));
            }
            LabelProjection::InCategory { .. } | LabelProjection::WithTag { .. } => {}
        }
    }

    fn insert(&self, connection: &Connection) -> Result<(), Error> {
        let mut category = connection.prepare(PROJECT_CATEGORY)?;
        for (id, row) in &self.categories {
            if let Some(name) = row.shown_name() {
                category.execute((id.as_bytes(), name, row.position()))?;
            }
        }
        let mut tag = connection.prepare(PROJECT_TAG)?;
        for (id, row) in &self.tags {
            if let Some(name) = row.shown_name() {
                tag.execute((id.as_bytes(), name, norm(name)))?;
            }
        }
        let mut in_category = connection.prepare(PROJECT_SERIES_CATEGORY)?;
        for (series, category) in &self.in_category {
            in_category.execute((series.as_bytes(), category.as_bytes()))?;
        }
        let mut with_tag = connection.prepare(PROJECT_SERIES_TAG)?;
        for (series, tag) in &self.with_tag {
            with_tag.execute((series.as_bytes(), tag.as_bytes()))?;
        }
        Ok(())
    }
}

enum Projection {
    Position { book: BookId, page: Option<u32> },
    Furthest { book: BookId, page: Option<u32> },
    Read { book: BookId, is_read: Option<bool> },
    Bookmark { id: BookmarkId, part: BookmarkPart },
    Label(LabelProjection),
    SeriesEdit(SeriesId),
    Removal { book: BookId, is_removed: bool },
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
            Key::Label(key) => Self::Label(LabelProjection::of(key, value)?),
            Key::SeriesEdit(key) => {
                let is_readable = match key {
                    SeriesEditKey::Adult(_) => flag(value).is_ok(),
                    SeriesEditKey::Title(_)
                    | SeriesEditKey::Summary(_)
                    | SeriesEditKey::People(_)
                    | SeriesEditKey::Tags(_) => text(value).is_ok(),
                };
                is_readable.then_some(Self::SeriesEdit(key.series()))?
            }
            Key::Removal(RemovalKey::Removed(book)) => Self::Removal {
                book,
                is_removed: flag(value).ok()? == Some(true),
            },
        })
    }

    const fn book(&self) -> Option<BookId> {
        match *self {
            Self::Position { book, .. } | Self::Furthest { book, .. } | Self::Read { book, .. } => {
                Some(book)
            }
            Self::Bookmark { .. } | Self::Label(_) | Self::SeriesEdit(_) | Self::Removal { .. } => {
                None
            }
        }
    }

    const fn fill(&self, row: &mut BookStateRow) {
        match *self {
            Self::Position { page, .. } => row.position_page = page,
            Self::Furthest { page, .. } => row.furthest_page = page,
            Self::Read { is_read, .. } => row.is_read = is_read,
            Self::Bookmark { .. } | Self::Label(_) | Self::SeriesEdit(_) | Self::Removal { .. } => {
            }
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
        if let Self::Label(label) = self {
            label.apply(connection)?;
            return Ok(0);
        }
        if let Self::SeriesEdit(series) = self {
            project_series_edit(connection, *series)?;
            return Ok(0);
        }
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
            Self::Removal {
                book,
                is_removed: true,
            } => Ok(connection.execute(PROJECT_REMOVED, [book.as_bytes()])?),
            Self::Removal {
                book,
                is_removed: false,
            } => Ok(connection.execute(REMOVE_REMOVED, [book.as_bytes()])?),
            Self::Bookmark { .. } | Self::Label(_) | Self::SeriesEdit(_) => Ok(0),
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

fn series_edits_of(connection: &Connection, series: SeriesId) -> Result<SeriesEdits, Error> {
    let mut statement = connection.prepare(SERIES_EDIT_REGISTERS)?;
    let mut registers = statement.query((series.as_bytes(), ProfileId::shared().as_bytes()))?;
    let mut edits = SeriesEdits::default();
    while let Some(register) = registers.next()? {
        let field: String = register.get(0)?;
        let cbor: Vec<u8> = register.get(1)?;
        let (Ok(Some(key)), Ok(value)) = (
            SeriesEditKey::stored("series", series.as_bytes(), &field),
            Value::from_cbor(&cbor),
        ) else {
            continue;
        };
        match key {
            SeriesEditKey::Title(_) => edits.title = text(&value).ok().flatten(),
            SeriesEditKey::Summary(_) => edits.summary = text(&value).ok().flatten(),
            SeriesEditKey::People(_) => {
                edits.people = text(&value).ok().flatten().map(|text| decode_people(&text));
            }
            SeriesEditKey::Tags(_) => {
                edits.tags = text(&value).ok().flatten().map(|text| decode_tags(&text));
            }
            SeriesEditKey::Adult(_) => {
                edits.is_adult = flag(&value).ok().flatten() == Some(true);
            }
        }
    }
    Ok(edits.normalized())
}

fn project_series_edit(connection: &Connection, series: SeriesId) -> Result<(), Error> {
    let id = series.as_bytes();
    for remove in REMOVE_SERIES_EDIT {
        connection.execute(remove, [id])?;
    }
    let edits = series_edits_of(connection, series)?;
    let title_key = edits
        .title
        .as_deref()
        .map(|title| TitleCollation::stored(connection).map(|collation| collation.key(title)))
        .transpose()?;
    if edits.is_empty() {
        return Ok(());
    }
    insert_edited_people_and_tags(connection, series, &edits)?;
    connection.execute(
        PROJECT_SERIES_EDIT,
        (
            id,
            &edits.title,
            title_key,
            &edits.summary,
            edits.is_adult,
            edits.people.is_some(),
            edits.tags.is_some(),
        ),
    )?;
    Ok(())
}

fn insert_edited_people_and_tags(
    connection: &Connection,
    series: SeriesId,
    edits: &SeriesEdits,
) -> Result<(), Error> {
    let id = series.as_bytes();
    if let Some(people) = &edits.people {
        let collation = TitleCollation::stored(connection)?;
        let mut insert = connection.prepare(PROJECT_EDITED_PERSON)?;
        let mut position = 0_i64;
        for EditedPerson { name, roles } in people {
            let key = collation.key(name);
            let codes: Vec<&str> = if roles.is_empty() {
                vec![NO_ROLE]
            } else {
                roles.iter().map(|role| role.as_stored()).collect()
            };
            for code in codes {
                insert.execute((id, position, code, name, &key))?;
                position += 1;
            }
        }
    }
    if let Some(tags) = &edits.tags {
        let mut insert = connection.prepare(PROJECT_EDITED_TAG)?;
        for (position, tag) in (0_i64..).zip(tags) {
            insert.execute((id, position, tag))?;
        }
    }
    Ok(())
}

pub(crate) fn reproject_series_edits(connection: &Connection) -> Result<(), Error> {
    let edited = connection
        .prepare("SELECT series_id FROM series_edit")?
        .query_map([], |row| stored_id::<SeriesId>(row, "series_id"))?
        .collect::<Result<Vec<_>, _>>()?;
    for series in edited {
        project_series_edit(connection, series)?;
    }
    Ok(())
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
    connection.execute("DELETE FROM book_removed", [])?;
    for clear in CLEAR_LABELS.into_iter().chain(CLEAR_SERIES_EDITS) {
        connection.execute(clear, [])?;
    }
    let mut projected = BTreeSet::new();
    let mut rows: BTreeMap<BookId, BookStateRow> = BTreeMap::new();
    let mut bookmarks: BTreeMap<BookmarkId, BookmarkRow> = BTreeMap::new();
    let mut labels = LabelRows::default();
    let mut edited = BTreeSet::new();
    for (key, projection) in shown_projections(connection)? {
        match (projection.book(), key) {
            (Some(book), _) => projection.fill(rows.entry(book).or_default()),
            (None, Key::Bookmark(bookmark)) => {
                projection.fill_bookmark(bookmarks.entry(bookmark.id()).or_default());
            }
            (None, Key::Label(_)) => {
                if let Projection::Label(label) = projection {
                    labels.take(label);
                }
            }
            (None, Key::SeriesEdit(edit)) => {
                edited.insert(edit.series());
            }
            (None, Key::Removal(_)) => {
                projection.apply(connection)?;
            }
            (None, _) => {}
        }
        projected.insert(key);
    }
    for series in edited {
        project_series_edit(connection, series)?;
    }
    let mut bookmark = connection.prepare(PROJECT_BOOKMARK)?;
    for (id, row) in bookmarks.iter().filter(|(_, row)| row.is_bookmarked()) {
        if let Some((book, page)) = row.place(*id) {
            bookmark.execute((book.as_bytes(), page))?;
        }
    }
    labels.insert(connection)?;
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

fn text(value: &Value) -> Result<Option<String>, OtherKind> {
    match value {
        Value::Null => Ok(None),
        Value::Text(text) => Ok(Some(text.clone())),
        Value::Bool(_) | Value::Unsigned(_) => Err(OtherKind),
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
