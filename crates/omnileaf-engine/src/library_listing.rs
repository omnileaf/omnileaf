use omnileaf_db::catalog::{
    FilterChoices, Inclusion as StoredInclusion, SeriesFilter, SeriesListing, SeriesOrder,
    SeriesSort, SortDirection as StoredDirection,
};
use serde::{Deserialize, Serialize};
use specta::Type;

pub(crate) const SMART_FILTERS_KEPT: &[SmartFilter] =
    &[SmartFilter::Forgotten, SmartFilter::Duplicates];

const DAY_MS: i64 = 24 * 60 * 60 * 1000;
const UNOPENED_UNTIL_FORGOTTEN_MS: i64 = 90 * DAY_MS;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
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
    LastRead,
    LastUpdated,
    UnreadCount,
    TimeLeft,
}

/// Ascending lists titles from A to Z, series added, updated or read longest ago first with those never read before them, the fewest unread books first, and the fewest pages left first with those whose pages aren't all counted last.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum SortDirection {
    #[default]
    Ascending,
    Descending,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LibraryFilter {
    /// Holds a book not marked read.
    pub unread: Inclusion,
    /// Holds a book opened, or marked read.
    pub started: Inclusion,
    /// Has every book marked read.
    pub finished: Inclusion,
    /// Is one of these formats, or any format when empty.
    pub formats: Vec<SeriesFormat>,
    /// Is in one of these languages, or any language when empty.
    pub languages: Vec<String>,
    /// Carries one of these tags, or any tag when empty.
    pub tags: Vec<String>,
    /// Has an adult age rating, or is marked adult by hand.
    pub adult: Inclusion,
    /// Has a bookmarked page.
    pub bookmarked: Inclusion,
    /// Meets every one of these smart filters.
    pub smart: Vec<SmartFilter>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum SmartFilter {
    /// Under 30 minutes left, at the reader's own reading speed.
    QuickReads,
    /// Not opened in three months.
    Forgotten,
    /// Holds the same book as another folder, even renamed.
    Duplicates,
    /// Downloaded and finished.
    ReadyToCleanUp,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum SeriesFormat {
    Comic,
    Manga,
    Book,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LibraryFilterChoices {
    pub formats: Vec<SeriesFormat>,
    pub languages: Vec<String>,
    pub tags: Vec<String>,
    pub rates_adult: bool,
    pub keeps_bookmarks: bool,
    pub smart: Vec<SmartFilter>,
}

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
                formats: Vec::new(),
                languages: Vec::new(),
                tags: Vec::new(),
                adult: Inclusion::Any,
                bookmarked: Inclusion::Any,
                smart: Vec::new(),
            },
        }
    }
}

impl LibraryListing {
    pub(crate) fn at(&self, now_ms: i64) -> SeriesListing {
        SeriesListing {
            sort: SeriesSort {
                order: match self.sort.by {
                    LibrarySortBy::Title => SeriesOrder::Title,
                    LibrarySortBy::DateAdded => SeriesOrder::DateAdded,
                    LibrarySortBy::LastRead => SeriesOrder::LastRead,
                    LibrarySortBy::LastUpdated => SeriesOrder::LastUpdated,
                    LibrarySortBy::UnreadCount => SeriesOrder::UnreadCount,
                    LibrarySortBy::TimeLeft => SeriesOrder::TimeLeft,
                },
                direction: self.sort.direction.into(),
            },
            filter: self.filter.at(now_ms),
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
                    SeriesOrder::LastRead => LibrarySortBy::LastRead,
                    SeriesOrder::LastUpdated => LibrarySortBy::LastUpdated,
                    SeriesOrder::UnreadCount => LibrarySortBy::UnreadCount,
                    SeriesOrder::TimeLeft => LibrarySortBy::TimeLeft,
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

impl From<FilterChoices> for LibraryFilterChoices {
    fn from(stored: FilterChoices) -> Self {
        Self {
            languages: stored.languages,
            tags: stored.tags,
            ..Self::default()
        }
    }
}

impl LibraryFilter {
    pub(crate) fn at(&self, now_ms: i64) -> SeriesFilter {
        SeriesFilter {
            unread: self.unread.into(),
            started: self.started.into(),
            finished: self.finished.into(),
            last_read_before_ms: self
                .smart
                .contains(&SmartFilter::Forgotten)
                .then(|| now_ms.saturating_sub(UNOPENED_UNTIL_FORGOTTEN_MS)),
            duplicates: if self.smart.contains(&SmartFilter::Duplicates) {
                StoredInclusion::Only
            } else {
                StoredInclusion::Any
            },
        }
    }
}

impl From<SeriesFilter> for LibraryFilter {
    fn from(filter: SeriesFilter) -> Self {
        Self {
            unread: filter.unread.into(),
            started: filter.started.into(),
            finished: filter.finished.into(),
            ..LibraryListing::default().filter
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

    const NOW_MS: i64 = 1_790_000_000_000;
    const NINETY_DAYS_MS: i64 = 7_776_000_000;

    #[test]
    fn lists_a_new_library_from_a_to_z_unfiltered() {
        let listing = LibraryListing::default();

        assert_eq!(
            listing.at(NOW_MS),
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
                formats: vec![SeriesFormat::Manga],
                languages: vec!["ja".to_owned()],
                tags: vec!["Seinen".to_owned()],
                adult: Inclusion::Hide,
                bookmarked: Inclusion::Only,
                smart: vec![SmartFilter::QuickReads, SmartFilter::ReadyToCleanUp],
            },
        };

        let json = serde_json::to_value(listing).unwrap();

        assert_eq!(
            json,
            serde_json::json!({
                "sort": { "by": "dateAdded", "direction": "descending" },
                "filter": {
                    "unread": "only",
                    "started": "any",
                    "finished": "hide",
                    "formats": ["manga"],
                    "languages": ["ja"],
                    "tags": ["Seinen"],
                    "adult": "hide",
                    "bookmarked": "only",
                    "smart": ["quickReads", "readyToCleanUp"],
                },
            })
        );
    }

    #[test]
    fn starts_a_new_library_narrowed_by_no_format_language_tag_rating_or_bookmark() {
        let filter = LibraryListing::default().filter;

        assert_eq!(
            (
                filter.formats,
                filter.languages,
                filter.tags,
                filter.adult,
                filter.bookmarked,
            ),
            (
                Vec::new(),
                Vec::new(),
                Vec::new(),
                Inclusion::Any,
                Inclusion::Any
            )
        );
    }

    #[test]
    fn asks_for_the_series_last_read_more_than_ninety_days_ago_once_forgotten_is_on() {
        let filter = LibraryFilter {
            smart: vec![SmartFilter::Forgotten],
            ..LibraryListing::default().filter
        };

        let stored = filter.at(NOW_MS);

        assert_eq!(stored.last_read_before_ms, Some(NOW_MS - NINETY_DAYS_MS));
    }

    #[test]
    fn asks_for_only_the_series_holding_a_book_stored_twice_once_duplicates_is_on() {
        let filter = LibraryFilter {
            smart: vec![SmartFilter::Duplicates],
            ..LibraryListing::default().filter
        };

        let stored = filter.at(NOW_MS);

        assert_eq!(stored.duplicates, StoredInclusion::Only);
    }

    #[test]
    fn starts_a_new_library_with_no_smart_filter_on() {
        assert_eq!(LibraryListing::default().filter.smart, Vec::new());
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
                ..LibraryListing::default().filter
            },
        };

        let read = LibraryListing::from(listing.at(NOW_MS));

        assert_eq!(read, listing);
    }
}
