use omnileaf_db::library_tabs::{StoredTab, TabPlace};
use serde::{Deserialize, Serialize};
use specta::Type;

use crate::CategoryId;

const BUILT_IN_TABS: [LibraryTab; 2] = [
    LibraryTab {
        id: LibraryTabId::All,
        is_hidden: false,
    },
    LibraryTab {
        id: LibraryTabId::NewChapters,
        is_hidden: true,
    },
];

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum LibraryTabId {
    All,
    /// Lists the series with chapters from a source not read yet, which a local library never has.
    NewChapters,
    Category {
        id: CategoryId,
    },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LibraryTab {
    pub id: LibraryTabId,
    /// Hiding a tab never removes a series.
    pub is_hidden: bool,
}

/// The tabs in the order given, each once, with All always shown and each built-in tab left out put back after the rest as a new library has it.
pub(crate) fn arranged(tabs: impl IntoIterator<Item = LibraryTab>) -> Vec<LibraryTab> {
    let mut arranged: Vec<LibraryTab> = Vec::new();
    for tab in tabs.into_iter().chain(BUILT_IN_TABS) {
        if arranged.iter().all(|kept| kept.id != tab.id) {
            let is_hidden = tab.is_hidden && tab.id != LibraryTabId::All;
            arranged.push(LibraryTab { is_hidden, ..tab });
        }
    }
    arranged
}

impl From<TabPlace> for LibraryTab {
    fn from(place: TabPlace) -> Self {
        Self {
            id: match place.tab {
                StoredTab::All => LibraryTabId::All,
                StoredTab::NewChapters => LibraryTabId::NewChapters,
                StoredTab::Category(id) => LibraryTabId::Category {
                    id: CategoryId::from(id),
                },
            },
            is_hidden: place.is_hidden,
        }
    }
}

impl From<LibraryTab> for TabPlace {
    fn from(tab: LibraryTab) -> Self {
        Self {
            tab: match tab.id {
                LibraryTabId::All => StoredTab::All,
                LibraryTabId::NewChapters => StoredTab::NewChapters,
                LibraryTabId::Category { id } => StoredTab::Category(id.into()),
            },
            is_hidden: tab.is_hidden,
        }
    }
}
