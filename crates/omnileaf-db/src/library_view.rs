//! How this device draws the library, which never syncs since each device has its own screen.

use rusqlite::{Connection, OptionalExtension, Row, Transaction};

use crate::Error;

const THE_VIEW: i64 = 1;

const STORED_VIEW: &str =
    "SELECT display, phone_covers_per_row, tablet_covers_per_row, desktop_covers_per_row, shows_item_counts
    FROM library_view
    WHERE id = ?1";

const SET_VIEW: &str = "INSERT INTO library_view
        (id, display, phone_covers_per_row, tablet_covers_per_row, desktop_covers_per_row, shows_item_counts)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6)
    ON CONFLICT (id) DO UPDATE SET
        display = excluded.display,
        phone_covers_per_row = excluded.phone_covers_per_row,
        tablet_covers_per_row = excluded.tablet_covers_per_row,
        desktop_covers_per_row = excluded.desktop_covers_per_row,
        shows_item_counts = excluded.shows_item_counts";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LibraryDisplay {
    Grid,
    Compact,
    List,
}

/// The view as stored, its covers per row held to their ranges by the schema alone.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct StoredLibraryView {
    pub display: LibraryDisplay,
    pub phone_covers_per_row: u8,
    pub tablet_covers_per_row: u8,
    pub desktop_covers_per_row: u8,
    pub shows_item_counts: bool,
}

/// None until a view is first set on this device.
pub fn library_view(connection: &Connection) -> Result<Option<StoredLibraryView>, Error> {
    let row = connection
        .prepare(STORED_VIEW)?
        .query_row([THE_VIEW], ViewRow::read)
        .optional()?;
    row.map(StoredLibraryView::try_from).transpose()
}

pub fn set_library_view(
    transaction: &Transaction<'_>,
    view: &StoredLibraryView,
) -> Result<(), Error> {
    transaction.prepare(SET_VIEW)?.execute((
        THE_VIEW,
        view.display.as_stored(),
        view.phone_covers_per_row,
        view.tablet_covers_per_row,
        view.desktop_covers_per_row,
        view.shows_item_counts,
    ))?;
    Ok(())
}

struct ViewRow {
    display: String,
    phone_covers_per_row: u8,
    tablet_covers_per_row: u8,
    desktop_covers_per_row: u8,
    shows_item_counts: bool,
}

impl ViewRow {
    fn read(row: &Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            display: row.get(0)?,
            phone_covers_per_row: row.get(1)?,
            tablet_covers_per_row: row.get(2)?,
            desktop_covers_per_row: row.get(3)?,
            shows_item_counts: row.get(4)?,
        })
    }
}

impl TryFrom<ViewRow> for StoredLibraryView {
    type Error = Error;

    fn try_from(row: ViewRow) -> Result<Self, Self::Error> {
        Ok(Self {
            display: LibraryDisplay::stored(row.display)?,
            phone_covers_per_row: row.phone_covers_per_row,
            tablet_covers_per_row: row.tablet_covers_per_row,
            desktop_covers_per_row: row.desktop_covers_per_row,
            shows_item_counts: row.shows_item_counts,
        })
    }
}

impl LibraryDisplay {
    const fn as_stored(self) -> &'static str {
        match self {
            Self::Grid => "grid",
            Self::Compact => "compact",
            Self::List => "list",
        }
    }

    fn stored(name: String) -> Result<Self, Error> {
        [Self::Grid, Self::Compact, Self::List]
            .into_iter()
            .find(|display| display.as_stored() == name)
            .ok_or(Error::UnsupportedLibraryDisplay { name })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scratch::ScratchLibrary;

    #[test]
    fn reads_the_view_by_its_key() {
        let scratch = ScratchLibrary::new("library-view-plan");

        let plan = scratch.query_plan(STORED_VIEW);

        assert_eq!(
            plan,
            ["SEARCH library_view USING INTEGER PRIMARY KEY (rowid=?)"]
        );
    }
}
