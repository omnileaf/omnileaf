use std::collections::BTreeSet;

use omnileaf_db::{
    Database, Error,
    catalog::{ScannedBook, books_of_series, removed_among},
    rusqlite::Connection,
};
use omnileaf_sync_proto::BookId as StoredBookId;
use serde::{Deserialize, Serialize};
use specta::Type;

use crate::{BookId, LibraryError, SeriesId};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum RemovalTarget {
    Series { id: SeriesId },
    Book { id: BookId },
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct RemovalReport {
    pub removed_series: u32,
    pub removed_books: u32,
    pub files: Vec<FileRemoval>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct FileRemoval {
    pub book: BookId,
    pub name: String,
    pub outcome: FileOutcome,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum FileOutcome {
    Trashed,
    Deleted,
    Missing,
    Failed { reason: RemovalFailure },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum RemovalFailure {
    PermissionDenied,
    Locked,
    UnsupportedLocation,
    Other,
}

pub(crate) struct Expanded {
    pub(crate) books: Vec<StoredBookId>,
    pub(crate) series_held: u32,
}

pub(crate) fn expand(
    connection: &Connection,
    targets: &[RemovalTarget],
) -> Result<Expanded, Error> {
    let mut books = BTreeSet::new();
    let mut series_held = 0_u32;
    for target in targets {
        match target {
            RemovalTarget::Book { id } => {
                books.insert(id.0);
            }
            RemovalTarget::Series { id } => {
                let held = books_of_series(connection, id.0)?;
                if !held.is_empty() {
                    series_held = series_held.saturating_add(1);
                }
                books.extend(held);
            }
        }
    }
    Ok(Expanded {
        books: books.into_iter().collect(),
        series_held,
    })
}

pub(crate) async fn marked_among<'a>(
    database: &Database,
    books: impl IntoIterator<Item = &'a ScannedBook>,
) -> Result<BTreeSet<StoredBookId>, LibraryError> {
    let found: Vec<StoredBookId> = books
        .into_iter()
        .map(|book| StoredBookId::local(&book.fingerprint))
        .collect();
    if found.is_empty() {
        return Ok(BTreeSet::new());
    }
    Ok(database
        .read(move |connection| removed_among(connection, &found))
        .await?)
}
