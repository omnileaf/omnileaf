use rusqlite::ToSql;

/// Which of the library's series a list holds, and in what order.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SeriesListing {
    pub sort: SeriesSort,
    pub filter: SeriesFilter,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SeriesSort {
    pub order: SeriesOrder,
    pub direction: SortDirection,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SeriesOrder {
    Title,
    DateAdded,
}

/// Ascending lists titles from A to Z and series added earliest first.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SortDirection {
    Ascending,
    Descending,
}

/// Each condition on a series' books' reading state, which a series must meet to be listed.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SeriesFilter {
    /// Holds a book not marked read.
    pub unread: Inclusion,
    /// Holds a book opened, or marked read.
    pub started: Inclusion,
    /// Has every book marked read.
    pub finished: Inclusion,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Inclusion {
    Any,
    Only,
    Hide,
}

impl SeriesListing {
    #[must_use]
    pub const fn unfiltered(sort: SeriesSort) -> Self {
        Self {
            sort,
            filter: SeriesFilter::NONE,
        }
    }
}

impl SeriesSort {
    #[must_use]
    pub const fn ascending(order: SeriesOrder) -> Self {
        Self {
            order,
            direction: SortDirection::Ascending,
        }
    }

    #[must_use]
    pub const fn descending(order: SeriesOrder) -> Self {
        Self {
            order,
            direction: SortDirection::Descending,
        }
    }
}

impl SeriesFilter {
    pub const NONE: Self = Self {
        unread: Inclusion::Any,
        started: Inclusion::Any,
        finished: Inclusion::Any,
    };
}

impl Inclusion {
    /// What the condition must be for a series to be listed, or none when either will do.
    const fn required(self) -> Option<bool> {
        match self {
            Self::Any => None,
            Self::Only => Some(true),
            Self::Hide => Some(false),
        }
    }
}

/// The SQL condition a series row meets when the filter bound as `:unread`, `:started` and `:finished` lets it through.
macro_rules! meets_the_filter {
    () => {
        "(:unread IS NULL OR (series.read_count < series.book_count) = :unread)
        AND (:started IS NULL OR (series.started_count > 0) = :started)
        AND (:finished IS NULL OR (series.read_count = series.book_count) = :finished)"
    };
}

pub(crate) use meets_the_filter;

/// A filter's conditions as the parameters [`meets_the_filter`] binds.
pub(crate) struct FilterParams {
    unread: Option<bool>,
    started: Option<bool>,
    finished: Option<bool>,
}

impl FilterParams {
    pub(crate) const fn of(filter: SeriesFilter) -> Self {
        Self {
            unread: filter.unread.required(),
            started: filter.started.required(),
            finished: filter.finished.required(),
        }
    }

    pub(crate) fn named(&self) -> [(&'static str, &dyn ToSql); 3] {
        [
            (":unread", &self.unread),
            (":started", &self.started),
            (":finished", &self.finished),
        ]
    }
}
