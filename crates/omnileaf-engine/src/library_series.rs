use std::fmt;

use omnileaf_db::catalog::{Cursor, Page, SeriesSummary};
use serde::{Deserialize, Serialize};
use specta::{Type, Types, datatype::DataType};

use crate::{CoverPath, ipc_brand::branded_string};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySeries {
    pub id: SeriesId,
    pub title: String,
    pub book_count: u32,
    pub unread_count: u32,
    pub cover: Option<CoverPath>,
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

#[cfg(test)]
pub(crate) fn sample_series_id() -> SeriesId {
    SeriesId(omnileaf_sync_proto::SeriesId::local("Sample Series").unwrap())
}

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
