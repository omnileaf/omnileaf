use omnileaf_db::library_view::{LibraryDisplay as StoredDisplay, StoredLibraryView};
use serde::{Deserialize, Serialize};
use specta::{Type, Types, datatype::DataType};

/// How this device draws the library.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LibraryView {
    pub display: LibraryDisplay,
    pub covers_per_row: CoversPerRow,
    /// Whether the number of series shows beside the library's title.
    pub shows_item_counts: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum LibraryDisplay {
    Grid,
    Compact,
    List,
}

/// How many covers a row holds at each size the library is drawn at, chosen apart since each wants its own.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct CoversPerRow {
    pub phone: PhoneColumns,
    pub tablet: TabletColumns,
    pub desktop: DesktopColumns,
}

pub type PhoneColumns = Columns<2, 5>;
pub type TabletColumns = Columns<3, 8>;
pub type DesktopColumns = Columns<4, 12>;

/// A number of covers per row from `FEWEST` to `MOST`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(into = "u8", try_from = "u8")]
pub struct Columns<const FEWEST: u8, const MOST: u8>(u8);

/// The fewest and most covers a row holds at one size.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Type)]
pub struct ColumnRange {
    pub fewest: u8,
    pub most: u8,
}

/// The range of covers per row each size offers.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Type)]
pub struct ColumnRanges {
    pub phone: ColumnRange,
    pub tablet: ColumnRange,
    pub desktop: ColumnRange,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, thiserror::Error)]
#[error("show {found} covers per row, outside the {fewest} to {most} this size holds")]
pub struct ColumnsOutOfRange {
    pub found: u8,
    pub fewest: u8,
    pub most: u8,
}

impl CoversPerRow {
    pub const RANGES: ColumnRanges = ColumnRanges {
        phone: PhoneColumns::RANGE,
        tablet: TabletColumns::RANGE,
        desktop: DesktopColumns::RANGE,
    };
}

impl<const FEWEST: u8, const MOST: u8> Columns<FEWEST, MOST> {
    pub const RANGE: ColumnRange = ColumnRange {
        fewest: FEWEST,
        most: MOST,
    };

    #[must_use]
    pub const fn get(self) -> u8 {
        self.0
    }
}

impl<const FEWEST: u8, const MOST: u8> TryFrom<u8> for Columns<FEWEST, MOST> {
    type Error = ColumnsOutOfRange;

    fn try_from(count: u8) -> Result<Self, Self::Error> {
        if (FEWEST..=MOST).contains(&count) {
            Ok(Self(count))
        } else {
            Err(ColumnsOutOfRange {
                found: count,
                fewest: FEWEST,
                most: MOST,
            })
        }
    }
}

impl<const FEWEST: u8, const MOST: u8> From<Columns<FEWEST, MOST>> for u8 {
    fn from(columns: Columns<FEWEST, MOST>) -> Self {
        columns.0
    }
}

impl<const FEWEST: u8, const MOST: u8> Type for Columns<FEWEST, MOST> {
    fn definition(types: &mut Types) -> DataType {
        u8::definition(types)
    }
}

impl Default for LibraryView {
    fn default() -> Self {
        Self {
            display: LibraryDisplay::Grid,
            covers_per_row: CoversPerRow {
                phone: Columns(3),
                tablet: Columns(5),
                desktop: Columns(6),
            },
            shows_item_counts: false,
        }
    }
}

impl From<LibraryView> for StoredLibraryView {
    fn from(view: LibraryView) -> Self {
        Self {
            display: match view.display {
                LibraryDisplay::Grid => StoredDisplay::Grid,
                LibraryDisplay::Compact => StoredDisplay::Compact,
                LibraryDisplay::List => StoredDisplay::List,
            },
            phone_columns: view.covers_per_row.phone.get(),
            tablet_columns: view.covers_per_row.tablet.get(),
            desktop_columns: view.covers_per_row.desktop.get(),
            shows_item_counts: view.shows_item_counts,
        }
    }
}

impl TryFrom<StoredLibraryView> for LibraryView {
    type Error = ColumnsOutOfRange;

    fn try_from(stored: StoredLibraryView) -> Result<Self, Self::Error> {
        Ok(Self {
            display: match stored.display {
                StoredDisplay::Grid => LibraryDisplay::Grid,
                StoredDisplay::Compact => LibraryDisplay::Compact,
                StoredDisplay::List => LibraryDisplay::List,
            },
            covers_per_row: CoversPerRow {
                phone: stored.phone_columns.try_into()?,
                tablet: stored.tablet_columns.try_into()?,
                desktop: stored.desktop_columns.try_into()?,
            },
            shows_item_counts: stored.shows_item_counts,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn draws_a_new_library_as_a_grid_of_the_boards_widths_without_item_counts() {
        let view = LibraryView::default();

        let widths = (
            view.covers_per_row.phone.get(),
            view.covers_per_row.tablet.get(),
            view.covers_per_row.desktop.get(),
        );
        assert_eq!(view.display, LibraryDisplay::Grid);
        assert_eq!(widths, (3, 5, 6));
        assert!(!view.shows_item_counts);
    }

    #[test]
    fn crosses_to_the_interface_with_each_size_s_covers_per_row_as_a_number() {
        let view = LibraryView::default();

        let json = serde_json::to_value(view).unwrap();

        assert_eq!(
            json,
            serde_json::json!({
                "display": "grid",
                "coversPerRow": { "phone": 3, "tablet": 5, "desktop": 6 },
                "showsItemCounts": false,
            })
        );
    }

    #[test]
    fn refuses_more_covers_per_row_than_a_phone_holds() {
        let outcome = serde_json::from_value::<LibraryView>(serde_json::json!({
            "display": "list",
            "coversPerRow": { "phone": 6, "tablet": 5, "desktop": 6 },
            "showsItemCounts": false,
        }));

        assert!(outcome.is_err());
    }

    #[test]
    fn refuses_fewer_covers_per_row_than_a_desktop_holds() {
        let outcome = DesktopColumns::try_from(3);

        assert_eq!(
            outcome,
            Err(ColumnsOutOfRange {
                found: 3,
                fewest: 4,
                most: 12,
            })
        );
    }

    #[test]
    fn takes_every_count_from_the_fewest_to_the_most_a_tablet_holds() {
        let counts: Vec<u8> = (0..=u8::MAX)
            .filter_map(|count| TabletColumns::try_from(count).ok())
            .map(TabletColumns::get)
            .collect();

        assert_eq!(counts, [3, 4, 5, 6, 7, 8]);
    }

    #[test]
    fn stores_a_view_and_reads_it_back_unchanged() {
        let view = LibraryView {
            display: LibraryDisplay::Compact,
            covers_per_row: CoversPerRow {
                phone: PhoneColumns::try_from(5).unwrap(),
                tablet: TabletColumns::try_from(8).unwrap(),
                desktop: DesktopColumns::try_from(12).unwrap(),
            },
            shows_item_counts: true,
        };

        let read = LibraryView::try_from(StoredLibraryView::from(view));

        assert_eq!(read, Ok(view));
    }
}
