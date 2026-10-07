//! How this device draws the library, which never syncs since each device has its own screen.

use rusqlite::{Connection, OptionalExtension, Row, Transaction};

use crate::Error;

const THE_VIEW: i64 = 1;

const STORED_VIEW: &str = "SELECT display,
        phone_covers_per_row, tablet_covers_per_row, desktop_covers_per_row,
        shows_item_counts, shows_unread_count, shows_downloaded, shows_language,
        shows_reading_progress, shows_continue_button
    FROM library_view
    WHERE id = ?1";

const SET_VIEW: &str = "INSERT INTO library_view (
        id, display,
        phone_covers_per_row, tablet_covers_per_row, desktop_covers_per_row,
        shows_item_counts, shows_unread_count, shows_downloaded, shows_language,
        shows_reading_progress, shows_continue_button
    )
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
    ON CONFLICT (id) DO UPDATE SET
        display = excluded.display,
        phone_covers_per_row = excluded.phone_covers_per_row,
        tablet_covers_per_row = excluded.tablet_covers_per_row,
        desktop_covers_per_row = excluded.desktop_covers_per_row,
        shows_item_counts = excluded.shows_item_counts,
        shows_unread_count = excluded.shows_unread_count,
        shows_downloaded = excluded.shows_downloaded,
        shows_language = excluded.shows_language,
        shows_reading_progress = excluded.shows_reading_progress,
        shows_continue_button = excluded.shows_continue_button";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LibraryDisplay {
    Grid,
    Compact,
    Covers,
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
    pub on_covers: OnCovers,
}

/// What each cover carries besides its picture and title.
#[expect(
    clippy::struct_excessive_bools,
    reason = "each is a switch of its own in the view options"
)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct OnCovers {
    pub shows_unread_count: bool,
    pub shows_downloaded: bool,
    pub shows_language: bool,
    pub shows_reading_progress: bool,
    pub shows_continue_button: bool,
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
        view.on_covers.shows_unread_count,
        view.on_covers.shows_downloaded,
        view.on_covers.shows_language,
        view.on_covers.shows_reading_progress,
        view.on_covers.shows_continue_button,
    ))?;
    Ok(())
}

struct ViewRow {
    display: String,
    phone_covers_per_row: u8,
    tablet_covers_per_row: u8,
    desktop_covers_per_row: u8,
    shows_item_counts: bool,
    on_covers: OnCovers,
}

impl ViewRow {
    fn read(row: &Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            display: row.get(0)?,
            phone_covers_per_row: row.get(1)?,
            tablet_covers_per_row: row.get(2)?,
            desktop_covers_per_row: row.get(3)?,
            shows_item_counts: row.get(4)?,
            on_covers: OnCovers {
                shows_unread_count: row.get(5)?,
                shows_downloaded: row.get(6)?,
                shows_language: row.get(7)?,
                shows_reading_progress: row.get(8)?,
                shows_continue_button: row.get(9)?,
            },
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
            on_covers: row.on_covers,
        })
    }
}

impl LibraryDisplay {
    const fn as_stored(self) -> &'static str {
        match self {
            Self::Grid => "grid",
            Self::Compact => "compact",
            Self::Covers => "covers",
            Self::List => "list",
        }
    }

    fn stored(name: String) -> Result<Self, Error> {
        [Self::Grid, Self::Compact, Self::Covers, Self::List]
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
