use omnileaf_db::catalog::{Cursor, SeriesSummary};
use serde::{Deserialize, Serialize};
use specta::{Type, Types, datatype::DataType};

use crate::{CoverPath, library_folder::branded_string};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySeries {
    pub title: String,
    pub book_count: u32,
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

/// Where the next page of series starts, handed back unchanged by whoever asked for the previous page.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(into = "String", try_from = "String")]
pub struct SeriesCursor(pub(crate) Cursor);

impl From<SeriesSummary> for LibrarySeries {
    fn from(series: SeriesSummary) -> Self {
        Self {
            title: series.title,
            book_count: series.book_count,
            cover: series.cover.map(CoverPath),
        }
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
