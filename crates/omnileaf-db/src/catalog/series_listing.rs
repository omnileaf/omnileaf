use rusqlite::ToSql;

use crate::catalog::value_list::{delimited_list, json_list};

#[derive(Clone, Debug, PartialEq, Eq)]
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

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SeriesFilter {
    /// Holds a book not marked read.
    pub unread: Inclusion,
    /// Holds a book opened, or marked read.
    pub started: Inclusion,
    /// Has every book marked read.
    pub finished: Inclusion,
    pub last_read_before_ms: Option<i64>,
    pub duplicates: Inclusion,
    /// Is in one of these formats, or any format when empty.
    pub formats: Vec<SeriesFormat>,
    /// Is in one of these languages, or any language when empty.
    pub languages: Vec<String>,
    /// Holds a book carrying one of these tags or genres, or any book when empty.
    pub tags: Vec<String>,
    /// Holds a book with a bookmarked page.
    pub bookmarked: Inclusion,
    /// Holds a book its files rate 18+, which counts only while `counts_age_ratings` holds.
    pub adult: Inclusion,
    pub counts_age_ratings: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SeriesFormat {
    Comic,
    Manga,
    Book,
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
        duplicates: Inclusion::Any,
        formats: Vec::new(),
        languages: Vec::new(),
        tags: Vec::new(),
        bookmarked: Inclusion::Any,
        adult: Inclusion::Any,
        counts_age_ratings: true,
    };

    #[must_use]
    pub const fn with_unread(mut self, unread: Inclusion) -> Self {
        self.unread = unread;
        self
    }

    #[must_use]
    pub const fn with_started(mut self, started: Inclusion) -> Self {
        self.started = started;
        self
    }

    #[must_use]
    pub const fn with_finished(mut self, finished: Inclusion) -> Self {
        self.finished = finished;
        self
    }

    #[must_use]
    pub const fn with_last_read_before_ms(mut self, last_read_before_ms: Option<i64>) -> Self {
        self.last_read_before_ms = last_read_before_ms;
        self
    }

    #[must_use]
    pub const fn with_duplicates(mut self, duplicates: Inclusion) -> Self {
        self.duplicates = duplicates;
        self
    }

    #[must_use]
    pub fn with_formats(mut self, formats: Vec<SeriesFormat>) -> Self {
        self.formats = formats;
        self
    }

    #[must_use]
    pub fn with_languages(mut self, languages: Vec<String>) -> Self {
        self.languages = languages;
        self
    }

    #[must_use]
    pub fn with_tags(mut self, tags: Vec<String>) -> Self {
        self.tags = tags;
        self
    }

    #[must_use]
    pub const fn with_bookmarked(mut self, bookmarked: Inclusion) -> Self {
        self.bookmarked = bookmarked;
        self
    }

    #[must_use]
    pub const fn with_adult(mut self, adult: Inclusion, counts_age_ratings: bool) -> Self {
        self.adult = adult;
        self.counts_age_ratings = counts_age_ratings;
        self
    }
}

impl Inclusion {
    const fn admits(self, holds: bool) -> bool {
        match self {
            Self::Any => true,
            Self::Only => holds,
            Self::Hide => !holds,
        }
    }

    const fn required(self) -> Option<bool> {
        match self {
            Self::Any => None,
            Self::Only => Some(true),
            Self::Hide => Some(false),
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
    const fn admits(&self, stage: ReadingStage) -> bool {
        self.unread.admits(stage.is_unread())
            && self.started.admits(stage.is_started())
            && self.finished.admits(stage.is_finished())
    }
}

/// Bound as `:unstarted`, `:in_progress` and `:finished`: each stage's stored value, or null for a stage the filter hides, which matches no series.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct StageParams {
    unstarted: Option<i64>,
    in_progress: Option<i64>,
    finished: Option<i64>,
}

impl StageParams {
    pub(crate) const fn of(filter: &SeriesFilter) -> Self {
        Self {
            unstarted: admitted(filter, ReadingStage::Unstarted),
            in_progress: admitted(filter, ReadingStage::InProgress),
            finished: admitted(filter, ReadingStage::Finished),
        }
    }

    /// Keeps each stage only while `holds_a_match` finds a series at its stored value.
    pub(crate) fn keeping<E>(
        self,
        mut holds_a_match: impl FnMut(i64) -> Result<bool, E>,
    ) -> Result<Self, E> {
        let mut kept = [self.unstarted, self.in_progress, self.finished];
        for stage in &mut kept {
            if let Some(stored) = *stage
                && !holds_a_match(stored)?
            {
                *stage = None;
            }
        }
        let [unstarted, in_progress, finished] = kept;
        Ok(Self {
            unstarted,
            in_progress,
            finished,
        })
    }

    pub(crate) fn named(&self) -> [(&'static str, &dyn ToSql); 3] {
        [
            (":unstarted", &self.unstarted),
            (":in_progress", &self.in_progress),
            (":finished", &self.finished),
        ]
    }
}

const fn admitted(filter: &SeriesFilter, stage: ReadingStage) -> Option<i64> {
    if filter.admits(stage) {
        Some(stage.stored())
    } else {
        None
    }
}

macro_rules! conditions {
    ($tags:literal) => {
        concat!(
            " AND (:last_read_before_ms IS NULL
            OR (series.last_read_at_ms > 0 AND series.last_read_at_ms < :last_read_before_ms))
        AND (:holds_duplicates IS NULL OR (series.duplicated_books > 0) = :holds_duplicates)
        AND (:formats IS NULL OR instr(
            :formats,
            char(31) || CASE WHEN series.manga_books > 0 THEN 'manga' ELSE 'comic' END || char(31)
        ) > 0)
        AND (:languages IS NULL OR (instr(series.language, char(31)) = 0
            AND instr(:languages, char(31) || series.language || char(31)) > 0))
        AND (:tag_list IS NULL OR ",
            $tags,
            ")
        AND (:holds_bookmarks IS NULL OR (series.bookmarked_books > 0) = :holds_bookmarks)
        AND (:holds_adult IS NULL
            OR (series.adult_rated_books > 0 AND :counts_age_ratings) = :holds_adult)"
        )
    };
}

/// For a page, which looks at each series it walks past, so a series' tags are probed one series at a time.
macro_rules! smart_conditions {
    () => {
        $crate::catalog::series_listing::conditions!(
            "EXISTS (SELECT 1 FROM series_tag
            WHERE series_tag.series_local_id = series.local_id
                AND series_tag.name IN (SELECT value FROM json_each(:tag_list)))"
        )
    };
}

/// For a count, which looks at every series, so the series carrying a tag are read once from the tag's index.
macro_rules! counted_conditions {
    () => {
        $crate::catalog::series_listing::conditions!(
            "series.local_id IN (SELECT series_tag.series_local_id FROM json_each(:tag_list) AS wanted
            JOIN series_tag ON series_tag.name = wanted.value)"
        )
    };
}

pub(crate) use conditions;
pub(crate) use counted_conditions;
pub(crate) use smart_conditions;

impl SeriesFormat {
    const fn stored(self) -> &'static str {
        match self {
            Self::Comic => "comic",
            Self::Manga => "manga",
            Self::Book => "book",
        }
    }
}

fn format_names(formats: &[SeriesFormat]) -> Vec<String> {
    formats
        .iter()
        .map(|format| format.stored().to_owned())
        .collect()
}

pub(crate) struct FilterParams {
    stages: StageParams,
    last_read_before_ms: Option<i64>,
    holds_duplicates: Option<bool>,
    formats: Option<String>,
    languages: Option<String>,
    tag_list: Option<String>,
    holds_bookmarks: Option<bool>,
    holds_adult: Option<bool>,
    counts_age_ratings: bool,
}

impl FilterParams {
    pub(crate) fn of(filter: &SeriesFilter) -> Self {
        Self::with_stages(filter, StageParams::of(filter))
    }

    pub(crate) fn with_stages(filter: &SeriesFilter, stages: StageParams) -> Self {
        Self {
            stages,
            last_read_before_ms: filter.last_read_before_ms,
            holds_duplicates: filter.duplicates.required(),
            formats: delimited_list(&format_names(&filter.formats)),
            languages: delimited_list(&filter.languages),
            tag_list: json_list(&filter.tags),
            holds_bookmarks: filter.bookmarked.required(),
            holds_adult: filter.adult.required(),
            counts_age_ratings: filter.counts_age_ratings,
        }
    }

    pub(crate) fn named(&self) -> [(&'static str, &dyn ToSql); 11] {
        let [unstarted, in_progress, finished] = self.stages.named();
        [
            unstarted,
            in_progress,
            finished,
            (":last_read_before_ms", &self.last_read_before_ms),
            (":holds_duplicates", &self.holds_duplicates),
            (":formats", &self.formats),
            (":languages", &self.languages),
            (":tag_list", &self.tag_list),
            (":holds_bookmarks", &self.holds_bookmarks),
            (":holds_adult", &self.holds_adult),
            (":counts_age_ratings", &self.counts_age_ratings),
        ]
    }
}
