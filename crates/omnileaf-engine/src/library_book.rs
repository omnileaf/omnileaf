use std::fmt;

use omnileaf_db::catalog::{self, BookSummary, Cursor, Page};
use serde::{Deserialize, Serialize};
use specta::{Type, Types, datatype::DataType};

use crate::{SortDirection, ipc_brand::branded_string};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SeriesBook {
    pub id: BookId,
    /// Counting from 1 in the series' order, whichever of its books a list holds.
    pub position: u32,
    pub title: String,
    /// When the library first found the book, in milliseconds since the Unix epoch; it crosses as a plain number, which holds every such date exactly.
    #[specta(type = i32)]
    pub added_at_ms: i64,
    pub reading: BookReading,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum BookReading {
    NotStarted,
    /// The page is where reading goes on from, counting from 1, and absent when only the furthest page read is known.
    Started {
        page: Option<u32>,
    },
    Read,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SeriesBookListing {
    pub shown: BooksShown,
    pub direction: SortDirection,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum BooksShown {
    #[default]
    All,
    Unread,
}

impl From<SeriesBookListing> for catalog::BookListing {
    fn from(listing: SeriesBookListing) -> Self {
        Self {
            shown: match listing.shown {
                BooksShown::All => catalog::BooksShown::All,
                BooksShown::Unread => catalog::BooksShown::Unread,
            },
            direction: listing.direction.into(),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum ReadMark {
    Read,
    Unread,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SeriesBookPage {
    pub books: Vec<SeriesBook>,
    pub next: Option<BookCursor>,
}

/// Crosses to the interface as an opaque string, which it hands back unchanged to name the book.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(into = "String", try_from = "String")]
pub struct BookId(pub(crate) omnileaf_sync_proto::BookId);

/// Where the next page of a series' books starts, handed back unchanged by whoever asked for the previous page.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(into = "String", try_from = "String")]
pub struct BookCursor(pub(crate) Cursor);

impl From<BookSummary> for SeriesBook {
    fn from(book: BookSummary) -> Self {
        Self {
            id: BookId(book.id),
            position: book.position,
            title: book.title,
            added_at_ms: book.added_at_ms,
            reading: book.reading.into(),
        }
    }
}

impl From<catalog::BookReading> for BookReading {
    fn from(reading: catalog::BookReading) -> Self {
        match reading {
            catalog::BookReading::NotStarted => Self::NotStarted,
            catalog::BookReading::Started { position_page } => Self::Started {
                page: position_page.map(|index| index.saturating_add(1)),
            },
            catalog::BookReading::Read { .. } => Self::Read,
        }
    }
}

impl From<Page<BookSummary>> for SeriesBookPage {
    fn from(page: Page<BookSummary>) -> Self {
        Self {
            books: page.items.into_iter().map(SeriesBook::from).collect(),
            next: page.next.map(BookCursor),
        }
    }
}

impl fmt::Display for BookId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.fmt(formatter)
    }
}

impl From<BookId> for String {
    fn from(id: BookId) -> Self {
        id.to_string()
    }
}

impl TryFrom<String> for BookId {
    type Error = omnileaf_sync_proto::IdError;

    fn try_from(text: String) -> Result<Self, Self::Error> {
        text.parse().map(Self)
    }
}

impl Type for BookId {
    fn definition(types: &mut Types) -> DataType {
        branded_string("BookId", types)
    }
}

impl From<BookCursor> for String {
    fn from(cursor: BookCursor) -> Self {
        cursor.0.to_string()
    }
}

impl TryFrom<String> for BookCursor {
    type Error = omnileaf_db::Error;

    fn try_from(text: String) -> Result<Self, Self::Error> {
        text.parse().map(Self)
    }
}

impl Type for BookCursor {
    fn definition(types: &mut Types) -> DataType {
        branded_string("BookCursor", types)
    }
}

#[cfg(test)]
pub(crate) fn sample_book_id(seed: u32) -> BookId {
    use omnileaf_sync_proto::{Fingerprint, ImageEntry};

    let fingerprint = Fingerprint::pmf1([ImageEntry {
        crc32: seed,
        size: 1,
    }])
    .unwrap();
    BookId(omnileaf_sync_proto::BookId::local(&fingerprint))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_the_page_reading_goes_on_from_starting_at_one() {
        let readings = [Some(0), Some(u32::MAX), None].map(|position_page| {
            BookReading::from(catalog::BookReading::Started { position_page })
        });

        assert_eq!(
            readings,
            [
                BookReading::Started { page: Some(1) },
                BookReading::Started {
                    page: Some(u32::MAX)
                },
                BookReading::Started { page: None },
            ]
        );
    }
}
