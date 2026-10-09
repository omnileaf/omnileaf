use omnileaf_db::catalog::{
    Inclusion as StoredInclusion, SeriesFilter, SeriesListing, SeriesOrder, SeriesSort,
    SortDirection as StoredDirection,
};
use serde::{Deserialize, Serialize};
use specta::Type;

/// Which series the library lists and in what order.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LibraryListing {
    pub sort: LibrarySort,
    pub filter: LibraryFilter,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySort {
    pub by: LibrarySortBy,
    pub direction: SortDirection,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum LibrarySortBy {
    Title,
    DateAdded,
}

/// Ascending lists titles from A to Z and series added earliest first.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum SortDirection {
    #[default]
    Ascending,
    Descending,
}

/// What a series' books' reading state must be for the library to list it.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LibraryFilter {
    /// Holds a book not marked read.
    pub unread: Inclusion,
    /// Holds a book opened, or marked read.
    pub started: Inclusion,
    /// Has every book marked read.
    pub finished: Inclusion,
}

/// Whether the library lists series meeting a condition alongside the rest, only those, or only the rest.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum Inclusion {
    Any,
    Only,
    Hide,
}

impl Default for LibraryListing {
    fn default() -> Self {
        Self {
            sort: LibrarySort {
                by: LibrarySortBy::Title,
                direction: SortDirection::Ascending,
            },
            filter: LibraryFilter {
                unread: Inclusion::Any,
                started: Inclusion::Any,
                finished: Inclusion::Any,
            },
        }
    }
}

impl From<LibraryListing> for SeriesListing {
    fn from(listing: LibraryListing) -> Self {
        Self {
            sort: SeriesSort {
                order: match listing.sort.by {
                    LibrarySortBy::Title => SeriesOrder::Title,
                    LibrarySortBy::DateAdded => SeriesOrder::DateAdded,
                },
                direction: listing.sort.direction.into(),
            },
            filter: listing.filter.into(),
        }
    }
}

impl From<SortDirection> for StoredDirection {
    fn from(direction: SortDirection) -> Self {
        match direction {
            SortDirection::Ascending => Self::Ascending,
            SortDirection::Descending => Self::Descending,
        }
    }
}

impl From<SeriesListing> for LibraryListing {
    fn from(listing: SeriesListing) -> Self {
        Self {
            sort: LibrarySort {
                by: match listing.sort.order {
                    SeriesOrder::Title => LibrarySortBy::Title,
                    SeriesOrder::DateAdded => LibrarySortBy::DateAdded,
                },
                direction: match listing.sort.direction {
                    StoredDirection::Ascending => SortDirection::Ascending,
                    StoredDirection::Descending => SortDirection::Descending,
                },
            },
            filter: listing.filter.into(),
        }
    }
}

impl From<LibraryFilter> for SeriesFilter {
    fn from(filter: LibraryFilter) -> Self {
        Self {
            unread: filter.unread.into(),
            started: filter.started.into(),
            finished: filter.finished.into(),
        }
    }
}

impl From<SeriesFilter> for LibraryFilter {
    fn from(filter: SeriesFilter) -> Self {
        Self {
            unread: filter.unread.into(),
            started: filter.started.into(),
            finished: filter.finished.into(),
        }
    }
}

impl From<Inclusion> for StoredInclusion {
    fn from(inclusion: Inclusion) -> Self {
        match inclusion {
            Inclusion::Any => Self::Any,
            Inclusion::Only => Self::Only,
            Inclusion::Hide => Self::Hide,
        }
    }
}

impl From<StoredInclusion> for Inclusion {
    fn from(inclusion: StoredInclusion) -> Self {
        match inclusion {
            StoredInclusion::Any => Self::Any,
            StoredInclusion::Only => Self::Only,
            StoredInclusion::Hide => Self::Hide,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_a_new_library_from_a_to_z_unfiltered() {
        let listing = LibraryListing::default();

        assert_eq!(
            SeriesListing::from(listing),
            SeriesListing::unfiltered(SeriesSort::ascending(SeriesOrder::Title))
        );
    }

    #[test]
    fn crosses_to_the_interface_with_each_choice_named() {
        let listing = LibraryListing {
            sort: LibrarySort {
                by: LibrarySortBy::DateAdded,
                direction: SortDirection::Descending,
            },
            filter: LibraryFilter {
                unread: Inclusion::Only,
                started: Inclusion::Any,
                finished: Inclusion::Hide,
            },
        };

        let json = serde_json::to_value(listing).unwrap();

        assert_eq!(
            json,
            serde_json::json!({
                "sort": { "by": "dateAdded", "direction": "descending" },
                "filter": { "unread": "only", "started": "any", "finished": "hide" },
            })
        );
    }

    #[test]
    fn stores_a_listing_and_reads_it_back_unchanged() {
        let listing = LibraryListing {
            sort: LibrarySort {
                by: LibrarySortBy::Title,
                direction: SortDirection::Descending,
            },
            filter: LibraryFilter {
                unread: Inclusion::Hide,
                started: Inclusion::Only,
                finished: Inclusion::Any,
            },
        };

        let read = LibraryListing::from(SeriesListing::from(listing));

        assert_eq!(read, listing);
    }
}
