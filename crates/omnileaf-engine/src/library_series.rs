use std::fmt;

use omnileaf_db::catalog::{Cursor, Page, SeriesSummary};
use serde::{Deserialize, Serialize};
use specta::{Type, Types, datatype::DataType};

use crate::{AdultContent, BookId, CoverPath, ipc_brand::branded_string};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySeries {
    pub id: SeriesId,
    pub title: String,
    pub book_count: u32,
    pub unread_count: u32,
    pub cover: Option<CoverPath>,
    pub language: Option<String>,
    /// Holds chapters downloaded from a source, which a local library never does.
    pub has_downloads: bool,
    pub continues_from: Option<BookId>,
    pub is_adult: bool,
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

impl LibrarySeries {
    fn new(series: SeriesSummary, adult: AdultContent) -> Self {
        Self {
            id: SeriesId(series.id),
            title: series.title,
            book_count: series.book_count,
            unread_count: series.unread_count,
            cover: series.cover.map(CoverPath),
            language: series.language,
            has_downloads: false,
            continues_from: series.continues_from.map(BookId),
            is_adult: adult.counts_as_adult(series.is_rated_adult),
        }
    }
}

impl SeriesPage {
    pub(crate) fn new(page: Page<SeriesSummary>, adult: AdultContent) -> Self {
        Self {
            series: page
                .items
                .into_iter()
                .map(|series| LibrarySeries::new(series, adult))
                .collect(),
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
    fn carries_no_downloads_until_the_library_works_them_out() {
        let summary = SeriesSummary {
            id: omnileaf_sync_proto::SeriesId::local("Sample Series 04").unwrap(),
            title: "Sample Series 04".to_owned(),
            book_count: 8,
            unread_count: 6,
            added_at_ms: 0,
            cover: None,
            continues_from: None,
            language: Some("en".to_owned()),
            is_rated_adult: true,
        };

        let series = LibrarySeries::new(summary, AdultContent::default());

        assert!(!series.has_downloads);
    }
}
