use omnileaf_db::library_view::{
    LibraryDisplay as StoredDisplay, OnCovers as StoredOnCovers, StoredLibraryView,
};
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
    pub on_covers: OnCovers,
}

/// What each cover carries besides its picture and title, each drawn only for a series with something to show.
#[expect(
    clippy::struct_excessive_bools,
    reason = "each is a switch of its own in the view options"
)]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct OnCovers {
    pub shows_unread_count: bool,
    pub shows_downloaded: bool,
    pub shows_language: bool,
    pub shows_reading_progress: bool,
    pub shows_continue_button: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum LibraryDisplay {
    Grid,
    Compact,
    Covers,
    List,
}

/// How many covers a row holds at each size the library is drawn at, chosen apart since each wants its own.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
pub struct CoversPerRow {
    pub phone: PhoneCoversPerRow,
    pub tablet: TabletCoversPerRow,
    pub desktop: DesktopCoversPerRow,
}

pub type PhoneCoversPerRow = CoversPerRowCount<2, 5>;
pub type TabletCoversPerRow = CoversPerRowCount<3, 8>;
pub type DesktopCoversPerRow = CoversPerRowCount<4, 12>;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(into = "u8", try_from = "u8")]
pub struct CoversPerRowCount<const FEWEST: u8, const MOST: u8>(u8);

/// The fewest and most covers a row holds at one size.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Type)]
pub struct CoversPerRowRange {
    pub fewest: u8,
    pub most: u8,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Type)]
pub struct CoversPerRowRanges {
    pub phone: CoversPerRowRange,
    pub tablet: CoversPerRowRange,
    pub desktop: CoversPerRowRange,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, thiserror::Error)]
#[error("show {found} covers per row, outside the {fewest} to {most} this size holds")]
pub struct CoversPerRowOutOfRange {
    pub found: u8,
    pub fewest: u8,
    pub most: u8,
}

impl CoversPerRow {
    pub const RANGES: CoversPerRowRanges = CoversPerRowRanges {
        phone: PhoneCoversPerRow::RANGE,
        tablet: TabletCoversPerRow::RANGE,
        desktop: DesktopCoversPerRow::RANGE,
    };
}

impl<const FEWEST: u8, const MOST: u8> CoversPerRowCount<FEWEST, MOST> {
    pub const RANGE: CoversPerRowRange = CoversPerRowRange {
        fewest: FEWEST,
        most: MOST,
    };

    #[must_use]
    pub const fn get(self) -> u8 {
        self.0
    }
}

impl<const FEWEST: u8, const MOST: u8> TryFrom<u8> for CoversPerRowCount<FEWEST, MOST> {
    type Error = CoversPerRowOutOfRange;

    fn try_from(count: u8) -> Result<Self, Self::Error> {
        if (FEWEST..=MOST).contains(&count) {
            Ok(Self(count))
        } else {
            Err(CoversPerRowOutOfRange {
                found: count,
                fewest: FEWEST,
                most: MOST,
            })
        }
    }
}

impl<const FEWEST: u8, const MOST: u8> From<CoversPerRowCount<FEWEST, MOST>> for u8 {
    fn from(count: CoversPerRowCount<FEWEST, MOST>) -> Self {
        count.0
    }
}

impl<const FEWEST: u8, const MOST: u8> Type for CoversPerRowCount<FEWEST, MOST> {
    fn definition(types: &mut Types) -> DataType {
        u8::definition(types)
    }
}

impl Default for LibraryView {
    fn default() -> Self {
        Self {
            display: LibraryDisplay::Grid,
            covers_per_row: CoversPerRow {
                phone: CoversPerRowCount(3),
                tablet: CoversPerRowCount(5),
                desktop: CoversPerRowCount(6),
            },
            shows_item_counts: false,
            on_covers: OnCovers {
                shows_unread_count: true,
                shows_downloaded: true,
                shows_language: false,
                shows_reading_progress: true,
                shows_continue_button: false,
            },
        }
    }
}

impl From<OnCovers> for StoredOnCovers {
    fn from(on_covers: OnCovers) -> Self {
        Self {
            shows_unread_count: on_covers.shows_unread_count,
            shows_downloaded: on_covers.shows_downloaded,
            shows_language: on_covers.shows_language,
            shows_reading_progress: on_covers.shows_reading_progress,
            shows_continue_button: on_covers.shows_continue_button,
        }
    }
}

impl From<StoredOnCovers> for OnCovers {
    fn from(stored: StoredOnCovers) -> Self {
        Self {
            shows_unread_count: stored.shows_unread_count,
            shows_downloaded: stored.shows_downloaded,
            shows_language: stored.shows_language,
            shows_reading_progress: stored.shows_reading_progress,
            shows_continue_button: stored.shows_continue_button,
        }
    }
}

impl From<LibraryView> for StoredLibraryView {
    fn from(view: LibraryView) -> Self {
        Self {
            display: match view.display {
                LibraryDisplay::Grid => StoredDisplay::Grid,
                LibraryDisplay::Compact => StoredDisplay::Compact,
                LibraryDisplay::Covers => StoredDisplay::Covers,
                LibraryDisplay::List => StoredDisplay::List,
            },
            phone_covers_per_row: view.covers_per_row.phone.get(),
            tablet_covers_per_row: view.covers_per_row.tablet.get(),
            desktop_covers_per_row: view.covers_per_row.desktop.get(),
            shows_item_counts: view.shows_item_counts,
            on_covers: view.on_covers.into(),
        }
    }
}

impl TryFrom<StoredLibraryView> for LibraryView {
    type Error = CoversPerRowOutOfRange;

    fn try_from(stored: StoredLibraryView) -> Result<Self, Self::Error> {
        Ok(Self {
            display: match stored.display {
                StoredDisplay::Grid => LibraryDisplay::Grid,
                StoredDisplay::Compact => LibraryDisplay::Compact,
                StoredDisplay::Covers => LibraryDisplay::Covers,
                StoredDisplay::List => LibraryDisplay::List,
            },
            covers_per_row: CoversPerRow {
                phone: stored.phone_covers_per_row.try_into()?,
                tablet: stored.tablet_covers_per_row.try_into()?,
                desktop: stored.desktop_covers_per_row.try_into()?,
            },
            shows_item_counts: stored.shows_item_counts,
            on_covers: stored.on_covers.into(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn draws_a_new_library_as_a_grid_of_three_five_and_six_covers_per_row_without_item_counts() {
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
    fn shows_a_new_library_s_unread_downloaded_and_progress_badges_but_not_its_language_or_continue_button()
     {
        let view = LibraryView::default();

        assert_eq!(
            view.on_covers,
            OnCovers {
                shows_unread_count: true,
                shows_downloaded: true,
                shows_language: false,
                shows_reading_progress: true,
                shows_continue_button: false,
            }
        );
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
                "onCovers": {
                    "showsUnreadCount": true,
                    "showsDownloaded": true,
                    "showsLanguage": false,
                    "showsReadingProgress": true,
                    "showsContinueButton": false,
                },
            })
        );
    }

    #[test]
    fn refuses_more_covers_per_row_than_a_phone_holds() {
        let outcome = serde_json::from_value::<LibraryView>(serde_json::json!({
            "display": "list",
            "coversPerRow": { "phone": 6, "tablet": 5, "desktop": 6 },
            "showsItemCounts": false,
            "onCovers": {
                "showsUnreadCount": true,
                "showsDownloaded": true,
                "showsLanguage": false,
                "showsReadingProgress": true,
                "showsContinueButton": false,
            },
        }));

        assert!(outcome.is_err());
    }

    #[test]
    fn refuses_fewer_covers_per_row_than_a_desktop_holds() {
        let outcome = DesktopCoversPerRow::try_from(3);

        assert_eq!(
            outcome,
            Err(CoversPerRowOutOfRange {
                found: 3,
                fewest: 4,
                most: 12,
            })
        );
    }

    #[test]
    fn takes_every_count_from_the_fewest_to_the_most_a_tablet_holds() {
        let counts: Vec<u8> = (0..=u8::MAX)
            .filter_map(|count| TabletCoversPerRow::try_from(count).ok())
            .map(TabletCoversPerRow::get)
            .collect();

        assert_eq!(counts, [3, 4, 5, 6, 7, 8]);
    }

    #[test]
    fn stores_covers_only_and_reads_it_back() {
        let view = LibraryView {
            display: LibraryDisplay::Covers,
            ..LibraryView::default()
        };

        let read = LibraryView::try_from(StoredLibraryView::from(view));

        assert_eq!(read, Ok(view));
    }

    #[test]
    fn names_covers_only_covers_for_the_interface() {
        let sent = serde_json::to_value(LibraryDisplay::Covers).unwrap();

        assert_eq!(sent, serde_json::json!("covers"));
    }

    #[test]
    fn stores_a_view_and_reads_it_back_unchanged() {
        let view = LibraryView {
            display: LibraryDisplay::Compact,
            covers_per_row: CoversPerRow {
                phone: PhoneCoversPerRow::try_from(5).unwrap(),
                tablet: TabletCoversPerRow::try_from(8).unwrap(),
                desktop: DesktopCoversPerRow::try_from(12).unwrap(),
            },
            shows_item_counts: true,
            on_covers: OnCovers {
                shows_unread_count: false,
                shows_downloaded: true,
                shows_language: true,
                shows_reading_progress: false,
                shows_continue_button: true,
            },
        };

        let read = LibraryView::try_from(StoredLibraryView::from(view));

        assert_eq!(read, Ok(view));
    }
}
