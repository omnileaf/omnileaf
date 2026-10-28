use omnileaf_db::catalog::{Cursor, WriterSummary};
use serde::{Deserialize, Serialize};
use specta::{Type, Types, datatype::DataType};

use crate::ipc_brand::branded_string;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LibraryWriter {
    pub name: String,
    pub series_count: u32,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct WriterPage {
    pub writers: Vec<LibraryWriter>,
    pub next: Option<WriterCursor>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(into = "String", try_from = "String")]
pub struct WriterCursor(pub(crate) Cursor);

impl From<WriterSummary> for LibraryWriter {
    fn from(writer: WriterSummary) -> Self {
        Self {
            name: writer.name,
            series_count: writer.series_count,
        }
    }
}

impl From<WriterCursor> for String {
    fn from(cursor: WriterCursor) -> Self {
        cursor.0.to_string()
    }
}

impl TryFrom<String> for WriterCursor {
    type Error = omnileaf_db::Error;

    fn try_from(text: String) -> Result<Self, Self::Error> {
        text.parse().map(Self)
    }
}

impl Type for WriterCursor {
    fn definition(types: &mut Types) -> DataType {
        branded_string("WriterCursor", types)
    }
}
