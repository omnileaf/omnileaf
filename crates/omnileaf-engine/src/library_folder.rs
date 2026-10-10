use std::{fmt, path::PathBuf, str::FromStr};

use omnileaf_db::catalog::{AndroidTree, Cursor, LibraryRoot, RootId, RootKind, RootLocator};
use serde::{Deserialize, Serialize};
use specta::{Type, Types, datatype::DataType};

use crate::{ipc_brand::branded_string, library_layout::folder_name};

const PLACE_SEPARATOR: &str = " › ";

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
        let location = match &root.locator {
            RootLocator::Path(path) | RootLocator::AppleBookmark { path, .. } => {
                path.display().to_string()
            }
            RootLocator::AndroidTree(tree) => tree_location(tree),
        };
        Self {
            id: FolderId(root.id),
            kind: match root.kind {
                RootKind::Home => FolderKind::Home,
                RootKind::Linked => FolderKind::Linked,
            },
            name: folder_name(&root_folder(&root.locator)),
            location,
            is_available: root.unavailable_since_ms.is_none(),
        }
    }
}

/// The folder the root's books are filed under, which for an Android folder is its name alone.
pub(crate) fn root_folder(locator: &RootLocator) -> PathBuf {
    match locator {
        RootLocator::Path(folder) | RootLocator::AppleBookmark { path: folder, .. } => {
            folder.clone()
        }
        RootLocator::AndroidTree(tree) => PathBuf::from(tree.name()),
    }
}

fn tree_location(tree: &AndroidTree) -> String {
    match tree.place() {
        "" => tree.name().to_owned(),
        place => format!("{place}{PLACE_SEPARATOR}{}", tree.name()),
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

#[cfg(test)]
mod tests {
    use omnileaf_db::catalog::TreeUri;

    use super::*;

    const COMICS_TREE: &str = "content://documents.test/tree/primary%3ADocuments%2FComics";

    fn tree_folder(place: &str) -> LibraryFolder {
        let tree = AndroidTree::new(
            TreeUri::parse(COMICS_TREE.to_owned()).unwrap(),
            "Comics".to_owned(),
            place.to_owned(),
        )
        .unwrap();
        LibraryFolder::from(LibraryRoot {
            id: "1".parse().unwrap(),
            kind: RootKind::Linked,
            locator: RootLocator::AndroidTree(tree),
            added_at_ms: 0,
            unavailable_since_ms: None,
        })
    }

    #[test]
    fn lists_an_android_folder_by_its_place_and_name() {
        let folder = tree_folder("Internal storage › Documents");

        assert_eq!(
            (folder.name.as_str(), folder.location.as_str()),
            ("Comics", "Internal storage › Documents › Comics")
        );
    }

    #[test]
    fn lists_an_android_folder_with_no_place_by_its_name_alone() {
        let folder = tree_folder("");

        assert_eq!(folder.location, "Comics");
    }
}
