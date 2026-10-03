use std::{fmt, path::PathBuf, str::FromStr};

use rusqlite::{
    OptionalExtension, Row, ToSql, Transaction,
    types::{FromSql, FromSqlError, FromSqlResult, ToSqlOutput, Type, ValueRef},
};

use crate::{Error, catalog::native_path};

const HOME_KIND: &str = "home";
const LINKED_KIND: &str = "linked";
const PATH_LOCATOR: &str = "path";
const ID_COLUMN: usize = 0;
const KIND_COLUMN: usize = 1;
const LOCATOR_KIND_COLUMN: usize = 2;
const ADDED_AT_COLUMN: usize = 4;
const UNAVAILABLE_SINCE_COLUMN: usize = 5;
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

/// Adding a folder the library already reads returns that root unchanged.
#[tracing::instrument(skip_all, fields(kind = ?root.kind))]
pub fn add_root(transaction: &Transaction<'_>, root: &NewRoot) -> Result<RootId, Error> {
    let (locator_kind, location) = stored_location(&root.locator);
    transaction
        .prepare(
            "INSERT INTO library_root (kind, locator_kind, location, added_at_ms)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT (location) DO NOTHING",
        )?
        .execute((root.kind, locator_kind, &location, root.added_at_ms))?;
    let id = transaction
        .prepare("SELECT id FROM library_root WHERE location = ?1")?
        .query_row([location], |row| row.get(0))?;
    Ok(RootId(id))
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

/// Reads a root from a row holding `id, kind, locator_kind, location, added_at_ms, unavailable_since_ms` in that order.
pub(crate) fn stored_root(row: &Row<'_>) -> rusqlite::Result<LibraryRoot> {
    Ok(LibraryRoot {
        id: RootId(row.get(ID_COLUMN)?),
        kind: row.get(KIND_COLUMN)?,
        locator: stored_locator(row, LOCATOR_KIND_COLUMN)?,
        added_at_ms: row.get(ADDED_AT_COLUMN)?,
        unavailable_since_ms: row.get(UNAVAILABLE_SINCE_COLUMN)?,
    })
}

pub(crate) fn stored_location(locator: &RootLocator) -> (&'static str, Vec<u8>) {
    match locator {
        RootLocator::Path(path) => (PATH_LOCATOR, native_path::to_bytes(path)),
    }
}

/// Reads a locator from a row holding its kind at `kind_column` and its location in the column after.
pub(crate) fn stored_locator(row: &Row<'_>, kind_column: usize) -> rusqlite::Result<RootLocator> {
    let location_column = kind_column + 1;
    let kind: String = row.get(kind_column)?;
    if kind != PATH_LOCATOR {
        return Err(rusqlite::Error::FromSqlConversionFailure(
            kind_column,
            Type::Text,
            Box::new(Error::UnsupportedLocator { kind }),
        ));
    }
    native_path::from_bytes(row.get(location_column)?)
        .map(RootLocator::Path)
        .ok_or_else(|| {
            rusqlite::Error::InvalidColumnType(location_column, "location".to_owned(), Type::Blob)
        })
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
