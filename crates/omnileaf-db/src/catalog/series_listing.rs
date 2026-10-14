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
    const fn admits(self, holds: bool) -> bool {
        match self {
            Self::Any => true,
            Self::Only => holds,
            Self::Hide => !holds,
        }
    }
}

/// How far through its books a listed series has been read, which decides every condition of a filter at once.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ReadingStage {
    Unstarted,
    InProgress,
    Finished,
}

impl ReadingStage {
    /// The value of the series' `reading_stage` column at this stage.
    const fn stored(self) -> i64 {
        match self {
            Self::Unstarted => 0,
            Self::InProgress => 1,
            Self::Finished => 2,
        }
    }

    const fn is_unread(self) -> bool {
        !matches!(self, Self::Finished)
    }

    const fn is_started(self) -> bool {
        !matches!(self, Self::Unstarted)
    }

    const fn is_finished(self) -> bool {
        matches!(self, Self::Finished)
    }
}

impl SeriesFilter {
    const fn admits(self, stage: ReadingStage) -> bool {
        self.unread.admits(stage.is_unread())
            && self.started.admits(stage.is_started())
            && self.finished.admits(stage.is_finished())
    }
}

/// The stages a filter lets through, bound as `:unstarted`, `:in_progress` and `:finished`: each one's stored value, or null for a stage it hides, which matches no series.
pub(crate) struct StageParams {
    unstarted: Option<i64>,
    in_progress: Option<i64>,
    finished: Option<i64>,
}

impl StageParams {
    pub(crate) const fn of(filter: SeriesFilter) -> Self {
        Self {
            unstarted: admitted(filter, ReadingStage::Unstarted),
            in_progress: admitted(filter, ReadingStage::InProgress),
            finished: admitted(filter, ReadingStage::Finished),
        }
    }

    pub(crate) fn named(&self) -> [(&'static str, &dyn ToSql); 3] {
        [
            (":unstarted", &self.unstarted),
            (":in_progress", &self.in_progress),
            (":finished", &self.finished),
        ]
    }
}

const fn admitted(filter: SeriesFilter, stage: ReadingStage) -> Option<i64> {
    if filter.admits(stage) {
        Some(stage.stored())
    } else {
        None
    }
}
