use std::fmt;

use omnileaf_db::catalog::{Cursor, Page, SeriesSummary};
use serde::{Deserialize, Serialize};
use specta::{Type, Types, datatype::DataType};

use crate::{BookId, CoverPath, ipc_brand::branded_string};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySeries {
    pub id: SeriesId,
    pub title: String,
    pub book_count: u32,
    pub unread_count: u32,
    pub cover: Option<CoverPath>,
    /// The language the books' details name, absent until the library reads them.
    pub language: Option<String>,
    /// Holds chapters downloaded from a source, which a local library never does.
    pub has_downloads: bool,
    /// The book Continue opens, absent until the library works it out for its list.
    pub continues_from: Option<BookId>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SeriesPage {
    pub series: Vec<LibrarySeries>,
    pub next: Option<SeriesCursor>,
}

/// Crosses to the interface as an opaque string, so it can tell one series from another however the list reorders, and hands it back to name the series.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(into = "String", try_from = "String")]
pub struct SeriesId(pub(crate) omnileaf_sync_proto::SeriesId);

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(into = "String", try_from = "String")]
pub struct SeriesCursor(pub(crate) Cursor);

impl From<SeriesSummary> for LibrarySeries {
    fn from(series: SeriesSummary) -> Self {
        Self {
            id: SeriesId(series.id),
            title: series.title,
            book_count: series.book_count,
            unread_count: series.unread_count,
            cover: series.cover.map(CoverPath),
            language: None,
            has_downloads: false,
            continues_from: None,
        }
    }
}

impl From<Page<SeriesSummary>> for SeriesPage {
    fn from(page: Page<SeriesSummary>) -> Self {
        Self {
            series: page.items.into_iter().map(LibrarySeries::from).collect(),
            next: page.next.map(SeriesCursor),
        }
    }
}

impl fmt::Display for SeriesId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.fmt(formatter)
    }
}

impl From<SeriesId> for String {
    fn from(id: SeriesId) -> Self {
        id.to_string()
    }
}

impl TryFrom<String> for SeriesId {
    type Error = omnileaf_sync_proto::IdError;

    fn try_from(text: String) -> Result<Self, Self::Error> {
        text.parse().map(Self)
    }
}

impl Type for SeriesId {
    fn definition(types: &mut Types) -> DataType {
        branded_string("SeriesId", types)
    }
}

impl From<SeriesCursor> for String {
    fn from(cursor: SeriesCursor) -> Self {
        cursor.0.to_string()
    }
}

impl TryFrom<String> for SeriesCursor {
    type Error = omnileaf_db::Error;

    fn try_from(text: String) -> Result<Self, Self::Error> {
        text.parse().map(Self)
    }
}

impl Type for SeriesCursor {
    fn definition(types: &mut Types) -> DataType {
        branded_string("SeriesCursor", types)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn carries_no_language_downloads_or_book_to_continue_until_the_library_reads_them() {
        let series = LibrarySeries::from(SeriesSummary {
            id: omnileaf_sync_proto::SeriesId::local("Sample Series 04").unwrap(),
            title: "Sample Series 04".to_owned(),
            book_count: 8,
            unread_count: 6,
            added_at_ms: 0,
            cover: None,
        });

        assert_eq!(
            (series.language, series.has_downloads, series.continues_from),
            (None, false, None)
        );
    }
}
