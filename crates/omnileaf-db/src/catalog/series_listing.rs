use rusqlite::ToSql;

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
    LastRead,
    LastUpdated,
    UnreadCount,
    TimeLeft,
}

/// Ascending lists titles from A to Z, series added, updated or read longest ago first with those never read before them, the fewest unread books first, and the fewest pages left first with those whose pages aren't all counted last.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SortDirection {
    Ascending,
    Descending,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SeriesFilter {
    /// Holds a book not marked read.
    pub unread: Inclusion,
    /// Holds a book opened, or marked read.
    pub started: Inclusion,
    /// Has every book marked read.
    pub finished: Inclusion,
    pub last_read_before_ms: Option<i64>,
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
        last_read_before_ms: None,
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

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ReadingStage {
    Unstarted,
    InProgress,
    Finished,
}

impl ReadingStage {
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

/// Bound as `:unstarted`, `:in_progress` and `:finished`: each stage's stored value, or null for a stage the filter hides, which matches no series.
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

macro_rules! smart_conditions {
    () => {
        " AND (:last_read_before_ms IS NULL
            OR (series.last_read_at_ms > 0 AND series.last_read_at_ms < :last_read_before_ms))"
    };
}

pub(crate) use smart_conditions;

pub(crate) struct FilterParams {
    stages: StageParams,
    last_read_before_ms: Option<i64>,
}

impl FilterParams {
    pub(crate) const fn of(filter: SeriesFilter) -> Self {
        Self {
            stages: StageParams::of(filter),
            last_read_before_ms: filter.last_read_before_ms,
        }
    }

    pub(crate) fn named(&self) -> [(&'static str, &dyn ToSql); 4] {
        let [unstarted, in_progress, finished] = self.stages.named();
        [
            unstarted,
            in_progress,
            finished,
            (":last_read_before_ms", &self.last_read_before_ms),
        ]
    }
}
