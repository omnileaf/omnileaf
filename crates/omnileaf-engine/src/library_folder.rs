use std::{fmt, str::FromStr};

use omnileaf_db::catalog::{Cursor, LibraryRoot, RootId, RootKind};
use serde::{Deserialize, Serialize};
use specta::{Type, Types, datatype::DataType};

use crate::{ipc_brand::branded_string, library_layout::folder_name};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LibraryFolder {
    pub id: FolderId,
    pub kind: FolderKind,
    pub name: String,
    pub location: String,
    /// False since a rescan last found the folder missing, unreadable or empty of the books it held.
    pub is_available: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum FolderKind {
    Home,
    Linked,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct FolderPage {
    pub folders: Vec<LibraryFolder>,
    /// Absent on the last page.
    pub next: Option<FolderCursor>,
}

/// Crosses to the interface as an opaque string, which it hands back unchanged to name the folder.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(into = "String", try_from = "String")]
pub struct FolderId(pub(crate) RootId);

/// Where the next page of folders starts, handed back unchanged by whoever asked for the previous page.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(into = "String", try_from = "String")]
pub struct FolderCursor(pub(crate) Cursor);

impl From<LibraryRoot> for LibraryFolder {
    fn from(root: LibraryRoot) -> Self {
        let path = root.locator.into_path();
        Self {
            id: FolderId(root.id),
            kind: match root.kind {
                RootKind::Home => FolderKind::Home,
                RootKind::Linked => FolderKind::Linked,
            },
            name: folder_name(&path),
            location: path.display().to_string(),
            is_available: root.unavailable_since_ms.is_none(),
        }
    }
}

impl fmt::Display for FolderId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0.fmt(formatter)
    }
}

impl FromStr for FolderId {
    type Err = omnileaf_db::Error;

    fn from_str(text: &str) -> Result<Self, Self::Err> {
        text.parse().map(Self)
    }
}

impl From<FolderId> for String {
    fn from(id: FolderId) -> Self {
        id.to_string()
    }
}

impl TryFrom<String> for FolderId {
    type Error = omnileaf_db::Error;

    fn try_from(text: String) -> Result<Self, Self::Error> {
        text.parse()
    }
}

impl From<FolderCursor> for String {
    fn from(cursor: FolderCursor) -> Self {
        cursor.0.to_string()
    }
}

impl TryFrom<String> for FolderCursor {
    type Error = omnileaf_db::Error;

    fn try_from(text: String) -> Result<Self, Self::Error> {
        text.parse().map(Self)
    }
}

impl Type for FolderId {
    fn definition(types: &mut Types) -> DataType {
        branded_string("FolderId", types)
    }
}

impl Type for FolderCursor {
    fn definition(types: &mut Types) -> DataType {
        branded_string("FolderCursor", types)
    }
}
