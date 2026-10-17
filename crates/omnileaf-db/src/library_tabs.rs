use rusqlite::{Connection, Row, Transaction};

use crate::Error;

const CATEGORY_PREFIX: &str = "category:";

const STORED_TABS: &str = "SELECT tab, is_hidden FROM library_tab ORDER BY position";

const FORGET_TABS: &str = "DELETE FROM library_tab";

const PLACE_TAB: &str = "INSERT INTO library_tab (position, tab, is_hidden) VALUES (?1, ?2, ?3)";

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum StoredTab {
    All,
    NewChapters,
    Category(String),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TabPlace {
    pub tab: StoredTab,
    pub is_hidden: bool,
}

/// The library's tabs in the order they were set, or none when they never were.
pub fn library_tabs(connection: &Connection) -> Result<Vec<TabPlace>, Error> {
    connection
        .prepare(STORED_TABS)?
        .query_map([], TabRow::read)?
        .map(|row| TabPlace::try_from(row?))
        .collect()
}

pub fn set_library_tabs(transaction: &Transaction<'_>, tabs: &[TabPlace]) -> Result<(), Error> {
    transaction.execute(FORGET_TABS, [])?;
    let mut place = transaction.prepare(PLACE_TAB)?;
    for (position, tab) in (0_i64..).zip(tabs) {
        place.execute((position, tab.tab.as_stored(), tab.is_hidden))?;
    }
    Ok(())
}

struct TabRow {
    tab: String,
    is_hidden: bool,
}

impl TabRow {
    fn read(row: &Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            tab: row.get(0)?,
            is_hidden: row.get(1)?,
        })
    }
}

impl TryFrom<TabRow> for TabPlace {
    type Error = Error;

    fn try_from(row: TabRow) -> Result<Self, Self::Error> {
        Ok(Self {
            tab: StoredTab::stored(row.tab)?,
            is_hidden: row.is_hidden,
        })
    }
}

impl StoredTab {
    fn as_stored(&self) -> String {
        match self {
            Self::All => "all".to_owned(),
            Self::NewChapters => "new_chapters".to_owned(),
            Self::Category(id) => format!("{CATEGORY_PREFIX}{id}"),
        }
    }

    fn stored(name: String) -> Result<Self, Error> {
        match name.as_str() {
            "all" => Ok(Self::All),
            "new_chapters" => Ok(Self::NewChapters),
            _ => match name.strip_prefix(CATEGORY_PREFIX) {
                Some(id) if !id.is_empty() => Ok(Self::Category(id.to_owned())),
                _ => Err(Error::UnsupportedLibraryTab { name }),
            },
        }
    }
}
