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
const ANDROID_TREE_LOCATOR: &str = "android_tree";
const CONTENT_SCHEME: &str = "content://";
const TREE_SEGMENT: &str = "tree";
const PATH_SEPARATORS: [char; 2] = ['/', '\\'];
const ID_COLUMN: usize = 0;
const KIND_COLUMN: usize = 1;
const LOCATOR_KIND_COLUMN: usize = 2;
const ADDED_AT_COLUMN: usize = 7;
const UNAVAILABLE_SINCE_COLUMN: usize = 8;
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
    /// A folder picked on Android, readable only through the documents provider serving its tree.
    AndroidTree(AndroidTree),
}

/// The `content://` address of a document tree, as the Android folder picker hands it over.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TreeUri(String);

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AndroidTree {
    uri: TreeUri,
    name: String,
    place: String,
}

#[derive(Clone, PartialEq, Eq)]
pub struct AppleBookmark(Vec<u8>);

impl fmt::Debug for AppleBookmark {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "AppleBookmark({} bytes)", self.0.len())
    }
}

impl RootLocator {
    /// Where the folder is on this device's file system, which an Android folder never has.
    #[must_use]
    pub fn local_path(&self) -> Option<&Path> {
        match self {
            Self::Path(path) | Self::AppleBookmark { path, .. } => Some(path),
            Self::AndroidTree(_) => None,
        }
    }
}

impl TreeUri {
    pub fn parse(uri: String) -> Result<Self, Error> {
        if is_document_tree(&uri) {
            Ok(Self(uri))
        } else {
            Err(Error::MalformedTreeUri { uri })
        }
    }

    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl AndroidTree {
    /// Refuses a name that isn't exactly one folder name, since the library reads the tree as a folder of that name.
    pub fn new(uri: TreeUri, name: String, place: String) -> Result<Self, Error> {
        if is_one_folder_name(&name) {
            Ok(Self { uri, name, place })
        } else {
            Err(Error::MalformedTreeName { name })
        }
    }

    #[must_use]
    pub fn uri(&self) -> &TreeUri {
        &self.uri
    }

    #[must_use]
    pub fn name(&self) -> &str {
        &self.name
    }

    /// Where the folder is, such as the storage volume and the folders above it, already joined for display.
    #[must_use]
    pub fn place(&self) -> &str {
        &self.place
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

/// Adding a folder the library already reads returns that root, which keeps a newer bookmark or Android folder labels only when it's a linked folder.
#[tracing::instrument(skip_all, fields(kind = ?root.kind))]
pub fn add_root(transaction: &Transaction<'_>, root: &NewRoot) -> Result<RootId, Error> {
    let stored = stored_location(&root.locator);
    transaction
        .prepare(
            "INSERT INTO library_root
                 (kind, locator_kind, location, bookmark, tree_name, tree_place, added_at_ms)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT (location) DO UPDATE
                 SET locator_kind = excluded.locator_kind,
                     bookmark = excluded.bookmark,
                     tree_name = excluded.tree_name,
                     tree_place = excluded.tree_place
                 WHERE library_root.kind = ?8 AND excluded.locator_kind != ?9",
        )?
        .execute((
            root.kind,
            stored.kind,
            &stored.location,
            stored.bookmark,
            stored.tree_name(),
            stored.tree_place(),
            root.added_at_ms,
            RootKind::Linked,
            PATH_LOCATOR,
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
            "UPDATE library_root
             SET locator_kind = ?2, location = ?3, bookmark = ?4, tree_name = ?5, tree_place = ?6
             WHERE id = ?1",
        )?
        .execute((
            id.0,
            stored.kind,
            &stored.location,
            stored.bookmark,
            stored.tree_name(),
            stored.tree_place(),
        ))?;
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

/// Reads a root from a row holding `id, kind, locator_kind, location, bookmark, tree_name, tree_place, added_at_ms, unavailable_since_ms` in that order.
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
    tree: Option<&'a AndroidTree>,
}

impl StoredLocation<'_> {
    fn tree_name(&self) -> Option<&str> {
        self.tree.map(AndroidTree::name)
    }

    fn tree_place(&self) -> Option<&str> {
        self.tree.map(AndroidTree::place)
    }
}

pub(crate) fn stored_location(locator: &RootLocator) -> StoredLocation<'_> {
    match locator {
        RootLocator::Path(path) => StoredLocation {
            kind: PATH_LOCATOR,
            location: native_path::to_bytes(path),
            bookmark: None,
            tree: None,
        },
        RootLocator::AppleBookmark { path, bookmark } => StoredLocation {
            kind: APPLE_BOOKMARK_LOCATOR,
            location: native_path::to_bytes(path),
            bookmark: Some(bookmark.as_bytes()),
            tree: None,
        },
        RootLocator::AndroidTree(tree) => StoredLocation {
            kind: ANDROID_TREE_LOCATOR,
            location: tree.uri.as_str().as_bytes().to_vec(),
            bookmark: None,
            tree: Some(tree),
        },
    }
}

/// Reads a locator from a row holding its kind at `kind_column`, then its location, bookmark, tree name and tree place.
pub(crate) fn stored_locator(row: &Row<'_>, kind_column: usize) -> rusqlite::Result<RootLocator> {
    let kind: String = row.get(kind_column)?;
    let path = || native_path::stored_native_path(row, kind_column + 1);
    match kind.as_str() {
        PATH_LOCATOR => Ok(RootLocator::Path(path()?)),
        APPLE_BOOKMARK_LOCATOR => Ok(RootLocator::AppleBookmark {
            path: path()?,
            bookmark: AppleBookmark(row.get(kind_column + 2)?),
        }),
        ANDROID_TREE_LOCATOR => stored_tree(row, kind_column).map(RootLocator::AndroidTree),
        _ => Err(unsupported_locator(kind_column, kind)),
    }
}

fn stored_tree(row: &Row<'_>, kind_column: usize) -> rusqlite::Result<AndroidTree> {
    let location_column = kind_column + 1;
    let malformed = |error: Box<dyn std::error::Error + Send + Sync>| {
        rusqlite::Error::FromSqlConversionFailure(location_column, Type::Blob, error)
    };
    let uri =
        String::from_utf8(row.get(location_column)?).map_err(|error| malformed(error.into()))?;
    let name = row.get(kind_column + 3)?;
    let place = row.get(kind_column + 4)?;
    TreeUri::parse(uri)
        .and_then(|uri| AndroidTree::new(uri, name, place))
        .map_err(|error| malformed(error.into()))
}

fn is_document_tree(uri: &str) -> bool {
    let Some(address) = uri.strip_prefix(CONTENT_SCHEME) else {
        return false;
    };
    let segments: Vec<&str> = address.split('/').collect();
    matches!(
        segments.as_slice(),
        [authority, TREE_SEGMENT, tree]
            if !authority.is_empty() && !tree.is_empty() && !tree.contains(['?', '#'])
    )
}

fn is_one_folder_name(name: &str) -> bool {
    !matches!(name, "" | "." | "..") && !name.contains(PATH_SEPARATORS)
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
    fn refuses_an_address_that_is_not_a_document_tree() {
        let addresses = [
            "",
            "file:///storage/emulated/0/Documents",
            "content://documents.test/document/1",
            "content://documents.test/tree/",
            "content:///tree/primary%3ADocuments",
            "content://documents.test/tree/primary%3ADocuments/document/primary%3ADocuments",
            "content://documents.test/tree/primary%3ADocuments?query",
            "content://documents.test/tree/primary%3ADocuments#fragment",
        ];

        let parsed = addresses.map(|uri| TreeUri::parse(uri.to_owned()));

        assert!(
            parsed
                .iter()
                .all(|outcome| matches!(outcome, Err(Error::MalformedTreeUri { .. })))
        );
    }

    #[test]
    fn reads_the_address_of_a_document_tree_as_it_was_given() {
        let uri = "content://documents.test/tree/primary%3ADocuments";

        let parsed = TreeUri::parse(uri.to_owned());

        assert!(matches!(parsed, Ok(tree) if tree.as_str() == uri));
    }

    #[test]
    fn refuses_a_folder_name_that_is_not_one_name() {
        let names = [
            "",
            ".",
            "..",
            "Comics/Manga",
            "Comics/",
            "/Comics",
            "Comics\\Manga",
        ];

        let made = names.map(|name| {
            AndroidTree::new(
                TreeUri(String::from("content://documents.test/tree/1")),
                name.to_owned(),
                String::new(),
            )
        });

        assert!(
            made.iter()
                .all(|outcome| matches!(outcome, Err(Error::MalformedTreeName { .. })))
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
