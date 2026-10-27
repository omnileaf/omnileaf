use std::str::FromStr;

use omnileaf_db::catalog::{Cursor, FolderGroup, FolderGroupSummary};
use serde::{Deserialize, Serialize};
use specta::{Type, Types, datatype::DataType};

use crate::{FolderId, ipc_brand::branded_string};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LibraryFolderGroup {
    pub id: FolderGroupId,
    pub folder: FolderId,
    pub folder_name: String,
    pub path: Vec<String>,
    pub series_count: u32,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct FolderGroupPage {
    pub groups: Vec<LibraryFolderGroup>,
    pub next: Option<FolderGroupCursor>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(into = "String", try_from = "String")]
pub struct FolderGroupId(pub(crate) FolderGroup);

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(into = "String", try_from = "String")]
pub struct FolderGroupCursor(pub(crate) Cursor);

impl LibraryFolderGroup {
    pub(crate) fn new(summary: FolderGroupSummary, folder_name: String) -> Self {
        let FolderGroupSummary {
            group,
            series_count,
        } = summary;
        Self {
            folder: FolderId(group.root),
            folder_name,
            path: group
                .location
                .iter()
                .map(|folder| folder.to_string_lossy().into_owned())
                .collect(),
            id: FolderGroupId(group),
            series_count,
        }
    }
}

impl From<FolderGroupId> for String {
    fn from(id: FolderGroupId) -> Self {
        id.0.to_string()
    }
}

impl TryFrom<String> for FolderGroupId {
    type Error = omnileaf_db::Error;

    fn try_from(text: String) -> Result<Self, Self::Error> {
        FolderGroup::from_str(&text).map(Self)
    }
}

impl From<FolderGroupCursor> for String {
    fn from(cursor: FolderGroupCursor) -> Self {
        cursor.0.to_string()
    }
}

impl TryFrom<String> for FolderGroupCursor {
    type Error = omnileaf_db::Error;

    fn try_from(text: String) -> Result<Self, Self::Error> {
        text.parse().map(Self)
    }
}

impl Type for FolderGroupId {
    fn definition(types: &mut Types) -> DataType {
        branded_string("FolderGroupId", types)
    }
}

impl Type for FolderGroupCursor {
    fn definition(types: &mut Types) -> DataType {
        branded_string("FolderGroupCursor", types)
    }
}
