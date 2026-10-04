use std::fmt;

use omnileaf_db::catalog::{Cursor, SeriesSummary};
use serde::{Deserialize, Serialize};
use specta::{Type, Types, datatype::DataType};

use crate::{CoverPath, ipc_brand::branded_string};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySeries {
    pub id: SeriesId,
    pub title: String,
    pub book_count: u32,
    /// Its books not marked read.
    pub unread_count: u32,
    /// The cover of its first book by title, absent while none of its books has a file.
    pub cover: Option<CoverPath>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SeriesPage {
    pub series: Vec<LibrarySeries>,
    /// Absent on the last page.
    pub next: Option<SeriesCursor>,
}

/// Crosses to the interface as an opaque string, so it can tell one series from another however the list reorders.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(into = "String")]
pub struct SeriesId(pub(crate) omnileaf_sync_proto::SeriesId);

/// Where the next page of series starts, handed back unchanged by whoever asked for the previous page.
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
