use std::{
    fmt,
    path::{Path, PathBuf},
    str::FromStr,
};

use rusqlite::{
    OptionalExtension, Row, ToSql, Transaction,
    types::{FromSql, FromSqlError, FromSqlResult, ToSqlOutput, Type, ValueRef},
};

use crate::{Error, catalog::native_path};

const HOME_KIND: &str = "home";
const LINKED_KIND: &str = "linked";
const PATH_LOCATOR: &str = "path";
pub(crate) const APPLE_BOOKMARK_LOCATOR: &str = "apple_bookmark";
const ID_COLUMN: usize = 0;
const KIND_COLUMN: usize = 1;
const LOCATOR_KIND_COLUMN: usize = 2;
const ADDED_AT_COLUMN: usize = 5;
const UNAVAILABLE_SINCE_COLUMN: usize = 6;
const BOOKS_FOUND_ONLY_IN_ROOT: &str = "DELETE FROM book
    WHERE id IN (SELECT book_id FROM book_file WHERE root_id = ?1)
        AND NOT EXISTS (
            SELECT 1 FROM book_file WHERE book_id = book.id AND root_id != ?1
        )";

/// A library root's row key, never handed to a later root because the table counts its ids up without reusing them.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct RootId(pub(crate) i64);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RootKind {
    /// The folder Omnileaf keeps its own data in, which the library always reads.
    Home,
    /// A folder of the user's that Omnileaf reads where it is and never changes.
    Linked,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum RootLocator {
    Path(PathBuf),
    /// A folder picked on iOS, readable only through its bookmark, at the path the bookmark last resolved to.
    AppleBookmark {
        path: PathBuf,
        bookmark: AppleBookmark,
    },
}

#[derive(Clone, PartialEq, Eq)]
pub struct AppleBookmark(Vec<u8>);

impl fmt::Debug for AppleBookmark {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "AppleBookmark({} bytes)", self.0.len())
    }
}

impl RootLocator {
    #[must_use]
    pub fn path(&self) -> &Path {
        match self {
            Self::Path(path) | Self::AppleBookmark { path, .. } => path,
        }
    }

    #[must_use]
    pub fn into_path(self) -> PathBuf {
        match self {
            Self::Path(path) | Self::AppleBookmark { path, .. } => path,
        }
    }
}

impl From<PathBuf> for RootLocator {
    fn from(path: PathBuf) -> Self {
        Self::Path(path)
    }
}

impl AppleBookmark {
    #[must_use]
    pub fn new(bytes: Vec<u8>) -> Self {
        Self(bytes)
    }

    #[must_use]
    pub fn as_bytes(&self) -> &[u8] {
        &self.0
    }
}

#[derive(Clone, Debug)]
pub struct NewRoot {
    pub kind: RootKind,
    pub locator: RootLocator,
    pub added_at_ms: i64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LibraryRoot {
    pub id: RootId,
    pub kind: RootKind,
    pub locator: RootLocator,
    pub added_at_ms: i64,
    /// Absent while the root was found the last time it was read.
    pub unavailable_since_ms: Option<i64>,
}

/// Adding a folder the library already reads returns that root, which keeps a newer bookmark only when it's a linked folder.
#[tracing::instrument(skip_all, fields(kind = ?root.kind))]
pub fn add_root(transaction: &Transaction<'_>, root: &NewRoot) -> Result<RootId, Error> {
    let stored = stored_location(&root.locator);
    transaction
        .prepare(
            "INSERT INTO library_root (kind, locator_kind, location, bookmark, added_at_ms)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT (location) DO UPDATE
                 SET locator_kind = excluded.locator_kind, bookmark = excluded.bookmark
                 WHERE library_root.kind = ?6 AND excluded.locator_kind = ?7",
        )?
        .execute((
            root.kind,
            stored.kind,
            &stored.location,
            stored.bookmark,
            root.added_at_ms,
            RootKind::Linked,
            APPLE_BOOKMARK_LOCATOR,
        ))?;
    let id = transaction
        .prepare("SELECT id FROM library_root WHERE location = ?1")?
        .query_row([stored.location], |row| row.get(0))?;
    Ok(RootId(id))
}

/// Points the root at where its folder is now, keeping its id and its books.
#[tracing::instrument(skip_all, fields(root = %id))]
pub fn relocate_root(
    transaction: &Transaction<'_>,
    id: RootId,
    locator: &RootLocator,
) -> Result<(), Error> {
    let stored = stored_location(locator);
    let holder: Option<i64> = transaction
        .prepare("SELECT id FROM library_root WHERE location = ?1 AND id != ?2")?
        .query_row((&stored.location, id.0), |row| row.get(0))
        .optional()?;
    if let Some(holder) = holder {
        return Err(Error::LocationTaken {
            id,
            holder: RootId(holder),
        });
    }
    let relocated = transaction
        .prepare(
            "UPDATE library_root SET locator_kind = ?2, location = ?3, bookmark = ?4
             WHERE id = ?1",
        )?
        .execute((id.0, stored.kind, &stored.location, stored.bookmark))?;
    if relocated == 0 {
        return Err(Error::UnknownRoot { id });
    }
    Ok(())
}

/// Removes a linked root and the books found only in it, leaving the files on disk alone.
#[tracing::instrument(skip_all, fields(root = %id))]
pub fn remove_root(transaction: &Transaction<'_>, id: RootId) -> Result<(), Error> {
    let kind: Option<RootKind> = transaction
        .prepare("SELECT kind FROM library_root WHERE id = ?1")?
        .query_row([id.0], |row| row.get(0))
        .optional()?;
    match kind {
        None => Err(Error::UnknownRoot { id }),
        Some(RootKind::Home) => Err(Error::HomeRoot { id }),
        Some(RootKind::Linked) => forget_root(transaction, id),
    }
}

/// Deletes the root and the books found only in it, whatever its kind.
pub(crate) fn forget_root(transaction: &Transaction<'_>, id: RootId) -> Result<(), Error> {
    transaction
        .prepare(BOOKS_FOUND_ONLY_IN_ROOT)?
        .execute([id.0])?;
    transaction
        .prepare("DELETE FROM library_root WHERE id = ?1")?
        .execute([id.0])?;
    Ok(())
}

/// Reads a root from a row holding `id, kind, locator_kind, location, bookmark, added_at_ms, unavailable_since_ms` in that order.
pub(crate) fn stored_root(row: &Row<'_>) -> rusqlite::Result<LibraryRoot> {
    Ok(LibraryRoot {
        id: RootId(row.get(ID_COLUMN)?),
        kind: row.get(KIND_COLUMN)?,
        locator: stored_locator(row, LOCATOR_KIND_COLUMN)?,
        added_at_ms: row.get(ADDED_AT_COLUMN)?,
        unavailable_since_ms: row.get(UNAVAILABLE_SINCE_COLUMN)?,
    })
}

pub(crate) struct StoredLocation<'a> {
    pub(crate) kind: &'static str,
    pub(crate) location: Vec<u8>,
    pub(crate) bookmark: Option<&'a [u8]>,
}

pub(crate) fn stored_location(locator: &RootLocator) -> StoredLocation<'_> {
    match locator {
        RootLocator::Path(path) => StoredLocation {
            kind: PATH_LOCATOR,
            location: native_path::to_bytes(path),
            bookmark: None,
        },
        RootLocator::AppleBookmark { path, bookmark } => StoredLocation {
            kind: APPLE_BOOKMARK_LOCATOR,
            location: native_path::to_bytes(path),
            bookmark: Some(bookmark.as_bytes()),
        },
    }
}

/// Reads a locator from a row holding its kind at `kind_column`, then its location and its bookmark.
pub(crate) fn stored_locator(row: &Row<'_>, kind_column: usize) -> rusqlite::Result<RootLocator> {
    let kind: String = row.get(kind_column)?;
    let path = || native_path::stored_native_path(row, kind_column + 1);
    match kind.as_str() {
        PATH_LOCATOR => Ok(RootLocator::Path(path()?)),
        APPLE_BOOKMARK_LOCATOR => Ok(RootLocator::AppleBookmark {
            path: path()?,
            bookmark: AppleBookmark(row.get(kind_column + 2)?),
        }),
        _ => Err(unsupported_locator(kind_column, kind)),
    }
}

/// Reads where a root's folder is from a row holding its locator kind at `kind_column` and its location in the column after.
pub(crate) fn stored_root_path(row: &Row<'_>, kind_column: usize) -> rusqlite::Result<PathBuf> {
    let kind: String = row.get(kind_column)?;
    match kind.as_str() {
        PATH_LOCATOR | APPLE_BOOKMARK_LOCATOR => {
            native_path::stored_native_path(row, kind_column + 1)
        }
        _ => Err(unsupported_locator(kind_column, kind)),
    }
}

fn unsupported_locator(kind_column: usize, kind: String) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(
        kind_column,
        Type::Text,
        Box::new(Error::UnsupportedLocator { kind }),
    )
}

impl ToSql for RootKind {
    fn to_sql(&self) -> rusqlite::Result<ToSqlOutput<'_>> {
        Ok(ToSqlOutput::from(match self {
            Self::Home => HOME_KIND,
            Self::Linked => LINKED_KIND,
        }))
    }
}

impl FromSql for RootKind {
    fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
        match value.as_str()? {
            HOME_KIND => Ok(Self::Home),
            LINKED_KIND => Ok(Self::Linked),
            _ => Err(FromSqlError::InvalidType),
        }
    }
}

impl fmt::Display for RootId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.fmt(formatter)
    }
}

impl FromStr for RootId {
    type Err = Error;

    fn from_str(text: &str) -> Result<Self, Error> {
        text.parse().map(Self).map_err(|_| Error::MalformedRootId)
    }
}

#[cfg(test)]
mod tests {
    use proptest::prelude::*;

    use super::*;
    use crate::scratch::ScratchLibrary;

    proptest! {
        #[test]
        fn reads_back_the_id_it_wrote(key in any::<i64>()) {
            let id = RootId(key);

            let read = id.to_string().parse::<RootId>();

            prop_assert!(matches!(read, Ok(read) if read == id));
        }
    }

    #[test]
    fn debug_prints_a_bookmark_s_size_and_not_the_folder_it_opens() {
        let bookmark = AppleBookmark::new(b"/private/var/mobile/Sample Comics".to_vec());

        let printed = format!("{bookmark:?}");

        assert_eq!(printed, "AppleBookmark(33 bytes)");
    }

    #[test]
    fn refuses_text_that_is_not_an_id() {
        let read = ["", "one", "1.5", "99999999999999999999"].map(str::parse::<RootId>);

        assert!(
            read.iter()
                .all(|outcome| matches!(outcome, Err(Error::MalformedRootId)))
        );
    }

    #[test]
    fn finds_the_books_of_a_removed_root_through_its_files_without_scanning_the_library() {
        let scratch = ScratchLibrary::new("remove-root-plan");

        let plan = scratch.query_plan(BOOKS_FOUND_ONLY_IN_ROOT);

        assert_eq!(
            plan,
            [
                "SEARCH book USING PRIMARY KEY (id=?)",
                "LIST SUBQUERY 1",
                "SEARCH book_file USING INDEX sqlite_autoindex_book_file_1 (root_id=?)",
                "CORRELATED SCALAR SUBQUERY 2",
                "SEARCH book_file USING INDEX book_file_by_book (book_id=?)",
                "SEARCH book_file USING COVERING INDEX book_file_by_book (book_id=?)",
            ]
        );
    }
}
