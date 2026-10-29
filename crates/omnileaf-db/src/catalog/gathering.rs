use rusqlite::{Connection, ToSql, named_params};

use crate::{
    Error,
    catalog::{
        series_listing::{Inclusion, SeriesFilter, SeriesFormat, SortDirection, StageParams},
        series_page::Directions,
        staged_rows::Listing,
        value_list::json_list,
    },
};

const FEW_SERIES: i64 = 400;
/// Sorting the series carrying a tag beats walking each stage up to about this many, since a walk probes every series it passes for the tag.
const FEW_TAGGED_SERIES: i64 = 1_500;

/// SQLite's planner prefers walking a sort order's index on from a cursor over sorting a few series, so the candidates name the index that finds them.
macro_rules! candidates {
    (index: $index:literal, condition: $condition:expr $(,)?) => {
        concat!(
            " FROM series INDEXED BY ",
            $index,
            " WHERE series.reading_stage IN (:unstarted, :in_progress, :finished) AND ",
            $condition
        )
    };
}

macro_rules! forgotten {
    () => {
        "series.last_read_at_ms > 0 AND series.last_read_at_ms < :last_read_before_ms"
    };
}

macro_rules! duplicated {
    () => {
        "series.duplicated_books > 0"
    };
}

macro_rules! quick {
    () => {
        "series.time_left_key > 0 AND series.time_left_key <= :pages_left_at_most"
    };
}

macro_rules! forgotten_candidates {
    () => {
        $crate::catalog::gathering::candidates! {
            index: "series_by_stage_and_last_read",
            condition: $crate::catalog::gathering::forgotten!(),
        }
    };
}

macro_rules! duplicated_candidates {
    () => {
        $crate::catalog::gathering::candidates! {
            index: "series_with_duplicates_by_stage",
            condition: $crate::catalog::gathering::duplicated!(),
        }
    };
}

macro_rules! quick_candidates {
    () => {
        $crate::catalog::gathering::candidates! {
            index: "series_by_stage_and_time_left",
            condition: $crate::catalog::gathering::quick!(),
        }
    };
}

macro_rules! language_candidates {
    () => {
        $crate::catalog::gathering::candidates! {
            index: "series_by_language",
            condition: "series.language IN (SELECT value FROM json_each(:language_list))",
        }
    };
}

macro_rules! manga_candidates {
    () => {
        $crate::catalog::gathering::candidates! {
            index: "series_manga_by_stage",
            condition: "series.manga_books > 0",
        }
    };
}

macro_rules! bookmarked_candidates {
    () => {
        $crate::catalog::gathering::candidates! {
            index: "series_bookmarked_by_stage",
            condition: "series.bookmarked_books > 0",
        }
    };
}

macro_rules! tagged_candidates {
    () => {
        concat!(
            " FROM series NOT INDEXED WHERE series.local_id IN (
                SELECT series_tag.series_local_id FROM json_each(:tag_list) AS wanted
                JOIN series_tag ON series_tag.name = wanted.value)
            AND series.reading_stage IN (:unstarted, :in_progress, :finished)"
        )
    };
}

macro_rules! rated_adult_candidates {
    () => {
        $crate::catalog::gathering::candidates! {
            index: "series_rated_adult_by_stage",
            condition: "series.adult_rated_books > 0",
        }
    };
}

macro_rules! holds_at_stage {
    (index: $index:literal, condition: $condition:expr $(,)?) => {
        concat!(
            "SELECT EXISTS (SELECT 1 FROM series INDEXED BY ",
            $index,
            " WHERE series.reading_stage = :stage AND ",
            $condition,
            ")"
        )
    };
}

const FORGOTTEN_AT_STAGE: &str = holds_at_stage! {
    index: "series_by_stage_and_last_read",
    condition: forgotten!(),
};
const DUPLICATED_AT_STAGE: &str = holds_at_stage! {
    index: "series_with_duplicates_by_stage",
    condition: duplicated!(),
};
const QUICK_AT_STAGE: &str = holds_at_stage! {
    index: "series_by_stage_and_time_left",
    condition: quick!(),
};

macro_rules! are_few {
    ($candidates:expr) => {
        concat!(
            "SELECT count(*) < :few FROM (SELECT 1",
            $candidates,
            " LIMIT :few)"
        )
    };
}

const FORGOTTEN_ARE_FEW: &str = are_few!(forgotten_candidates!());
const DUPLICATED_ARE_FEW: &str = are_few!(duplicated_candidates!());
const QUICK_ARE_FEW: &str = are_few!(quick_candidates!());
const LANGUAGES_ARE_FEW: &str = are_few!(language_candidates!());
const RATED_ADULT_ARE_FEW: &str = are_few!(rated_adult_candidates!());
const MANGA_ARE_FEW: &str = are_few!(manga_candidates!());
const BOOKMARKED_ARE_FEW: &str = are_few!(bookmarked_candidates!());
/// Counts the entries of the chosen tags' index rather than the series, which can only overcount, so it never takes a crowded tag for a rare one.
const TAGGED_ARE_FEW: &str = "SELECT count(*) < :few FROM (
    SELECT 1 FROM series_tag WHERE name IN (SELECT value FROM json_each(:tag_list)) LIMIT :few)";

/// SQLite works out every result column of a row before sorting it, so only the keys are sorted and the page's other columns read afterwards.
macro_rules! sorted_page {
    (candidates: $candidates:expr, conditions: $conditions:expr, seek: $seek:expr, order: $order:expr $(,)?) => {
        concat!(
            "WITH page AS MATERIALIZED (SELECT series.local_id",
            $candidates,
            $conditions,
            $seek,
            " ORDER BY ",
            $order,
            " LIMIT :limit) ",
            $crate::catalog::staged_rows::summary_columns!(),
            "CASE WHEN series.reading_stage = :in_progress THEN ",
            $crate::catalog::series_books::book_up_next!(),
            " END AS continues_from
            FROM page JOIN series ON series.local_id = page.local_id ",
            $crate::catalog::cover::join_series_cover!(),
            " ORDER BY ",
            $order
        )
    };
}

macro_rules! sorted_directions {
    (candidates: $candidates:expr, key: $key:literal, sort_position: $position:expr $(,)?) => {
        $crate::catalog::gathering::sorted_directions! {
            candidates: $candidates,
            conditions: $crate::catalog::series_listing::smart_conditions!(),
            key: $key,
            sort_position: $position,
        }
    };
    (candidates: $candidates:expr, conditions: $conditions:expr, key: $key:literal, sort_position: $position:expr $(,)?) => {
        $crate::catalog::series_page::Directions {
            ascending: $crate::catalog::staged_rows::Listing {
                first_page_query: $crate::catalog::gathering::sorted_page! {
                    candidates: $candidates,
                    conditions: $conditions,
                    seek: "",
                    order: concat!($key, ", id"),
                },
                next_page_query: $crate::catalog::gathering::sorted_page! {
                    candidates: $candidates,
                    conditions: $conditions,
                    seek: concat!(" AND (series.", $key, ", series.id) > (:after_key, :after_id)"),
                    order: concat!($key, ", id"),
                },
                sort_position: $position,
            },
            descending: $crate::catalog::staged_rows::Listing {
                first_page_query: $crate::catalog::gathering::sorted_page! {
                    candidates: $candidates,
                    conditions: $conditions,
                    seek: "",
                    order: concat!($key, " DESC, id DESC"),
                },
                next_page_query: $crate::catalog::gathering::sorted_page! {
                    candidates: $candidates,
                    conditions: $conditions,
                    seek: concat!(" AND (series.", $key, ", series.id) < (:after_key, :after_id)"),
                    order: concat!($key, " DESC, id DESC"),
                },
                sort_position: $position,
            },
        }
    };
}

macro_rules! gatherings {
    (key: $key:literal, sort_position: $position:expr $(,)?) => {
        $crate::catalog::gathering::Gatherings {
            each_stage_in_order: $crate::catalog::series_page::directions! {
                key: $key,
                sort_position: $position,
            },
            few_forgotten: $crate::catalog::gathering::sorted_directions! {
                candidates: $crate::catalog::gathering::forgotten_candidates!(),
                key: $key,
                sort_position: $position,
            },
            few_duplicated: $crate::catalog::gathering::sorted_directions! {
                candidates: $crate::catalog::gathering::duplicated_candidates!(),
                key: $key,
                sort_position: $position,
            },
            few_quick: $crate::catalog::gathering::sorted_directions! {
                candidates: $crate::catalog::gathering::quick_candidates!(),
                key: $key,
                sort_position: $position,
            },
            few_in_languages: $crate::catalog::gathering::sorted_directions! {
                candidates: $crate::catalog::gathering::language_candidates!(),
                key: $key,
                sort_position: $position,
            },
            few_tagged: $crate::catalog::gathering::sorted_directions! {
                candidates: $crate::catalog::gathering::tagged_candidates!(),
                conditions: $crate::catalog::series_listing::conditions_of_tagged_candidates!(),
                key: $key,
                sort_position: $position,
            },
            few_manga: $crate::catalog::gathering::sorted_directions! {
                candidates: $crate::catalog::gathering::manga_candidates!(),
                key: $key,
                sort_position: $position,
            },
            few_bookmarked: $crate::catalog::gathering::sorted_directions! {
                candidates: $crate::catalog::gathering::bookmarked_candidates!(),
                key: $key,
                sort_position: $position,
            },
            few_rated_adult: $crate::catalog::gathering::sorted_directions! {
                candidates: $crate::catalog::gathering::rated_adult_candidates!(),
                key: $key,
                sort_position: $position,
            },
        }
    };
}

pub(crate) use bookmarked_candidates;
pub(crate) use candidates;
pub(crate) use duplicated;
pub(crate) use duplicated_candidates;
pub(crate) use forgotten;
pub(crate) use forgotten_candidates;
pub(crate) use gatherings;
pub(crate) use language_candidates;
pub(crate) use manga_candidates;
pub(crate) use quick;
pub(crate) use quick_candidates;
pub(crate) use rated_adult_candidates;
pub(crate) use sorted_directions;
pub(crate) use sorted_page;
pub(crate) use tagged_candidates;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Gathering {
    EachStageInOrder,
    FewForgotten,
    FewDuplicated,
    FewQuickReads,
    FewInLanguages,
    FewRatedAdult,
    FewTagged,
    FewManga,
    FewBookmarked,
}

pub(crate) struct Gatherings<P> {
    pub(crate) each_stage_in_order: Directions<P>,
    pub(crate) few_forgotten: Directions<P>,
    pub(crate) few_duplicated: Directions<P>,
    pub(crate) few_quick: Directions<P>,
    pub(crate) few_in_languages: Directions<P>,
    pub(crate) few_rated_adult: Directions<P>,
    pub(crate) few_tagged: Directions<P>,
    pub(crate) few_manga: Directions<P>,
    pub(crate) few_bookmarked: Directions<P>,
}

impl Gathering {
    pub(crate) fn of(connection: &Connection, filter: &SeriesFilter) -> Result<Self, Error> {
        let stages = StageParams::of(filter);
        if let Some(before) = filter.last_read_before_ms
            && are_few(
                connection,
                FORGOTTEN_ARE_FEW,
                &stages,
                &[(":last_read_before_ms", &before)],
            )?
        {
            return Ok(Self::FewForgotten);
        }
        if filter.duplicates == Inclusion::Only
            && are_few(connection, DUPLICATED_ARE_FEW, &stages, &[])?
        {
            return Ok(Self::FewDuplicated);
        }
        if let Some(pages_left) = filter.pages_left_at_most
            && are_few(
                connection,
                QUICK_ARE_FEW,
                &stages,
                &[(":pages_left_at_most", &pages_left)],
            )?
        {
            return Ok(Self::FewQuickReads);
        }
        if let Some(languages) = json_list(&filter.languages)
            && are_few(
                connection,
                LANGUAGES_ARE_FEW,
                &stages,
                &[(":language_list", &languages)],
            )?
        {
            return Ok(Self::FewInLanguages);
        }
        if let Some(tags) = json_list(&filter.tags)
            && tagged_are_few(connection, &tags)?
        {
            return Ok(Self::FewTagged);
        }
        if filter.formats.contains(&SeriesFormat::Manga)
            && !filter.formats.contains(&SeriesFormat::Comic)
            && are_few(connection, MANGA_ARE_FEW, &stages, &[])?
        {
            return Ok(Self::FewManga);
        }
        if filter.bookmarked == Inclusion::Only
            && are_few(connection, BOOKMARKED_ARE_FEW, &stages, &[])?
        {
            return Ok(Self::FewBookmarked);
        }
        if filter.adult == Inclusion::Only
            && are_few(connection, RATED_ADULT_ARE_FEW, &stages, &[])?
        {
            return Ok(Self::FewRatedAdult);
        }
        Ok(Self::EachStageInOrder)
    }
}

impl<P> Gatherings<P> {
    pub(crate) const fn toward(
        &self,
        gathering: Gathering,
        direction: SortDirection,
    ) -> &Listing<P> {
        match gathering {
            Gathering::EachStageInOrder => self.each_stage_in_order.toward(direction),
            Gathering::FewForgotten => self.few_forgotten.toward(direction),
            Gathering::FewDuplicated => self.few_duplicated.toward(direction),
            Gathering::FewQuickReads => self.few_quick.toward(direction),
            Gathering::FewInLanguages => self.few_in_languages.toward(direction),
            Gathering::FewRatedAdult => self.few_rated_adult.toward(direction),
            Gathering::FewTagged => self.few_tagged.toward(direction),
            Gathering::FewManga => self.few_manga.toward(direction),
            Gathering::FewBookmarked => self.few_bookmarked.toward(direction),
        }
    }
}

/// The stages the filter lets through, less each one holding no series that meets its smart conditions.
pub(crate) fn stages_holding_matches(
    connection: &Connection,
    filter: &SeriesFilter,
) -> Result<StageParams, Error> {
    if filter.last_read_before_ms.is_none()
        && filter.duplicates != Inclusion::Only
        && filter.pages_left_at_most.is_none()
    {
        return Ok(StageParams::of(filter));
    }
    let mut forgotten = connection.prepare(FORGOTTEN_AT_STAGE)?;
    let mut duplicated = connection.prepare(DUPLICATED_AT_STAGE)?;
    let mut quick = connection.prepare(QUICK_AT_STAGE)?;
    StageParams::of(filter).keeping(|stage| {
        let holds_forgotten = match filter.last_read_before_ms {
            Some(before) => forgotten.query_row(
                named_params! { ":stage": stage, ":last_read_before_ms": before },
                |row| row.get(0),
            )?,
            None => true,
        };
        let holds_duplicated = match filter.duplicates {
            Inclusion::Only => {
                duplicated.query_row(named_params! { ":stage": stage }, |row| row.get(0))?
            }
            Inclusion::Any | Inclusion::Hide => true,
        };
        let holds_quick_reads = match filter.pages_left_at_most {
            Some(pages_left) => quick.query_row(
                named_params! { ":stage": stage, ":pages_left_at_most": pages_left },
                |row| row.get(0),
            )?,
            None => true,
        };
        Ok(holds_forgotten && holds_duplicated && holds_quick_reads)
    })
}

fn tagged_are_few(connection: &Connection, tags: &str) -> Result<bool, Error> {
    Ok(connection.prepare_cached(TAGGED_ARE_FEW)?.query_row(
        named_params! { ":few": FEW_TAGGED_SERIES, ":tag_list": tags },
        |row| row.get(0),
    )?)
}

fn are_few(
    connection: &Connection,
    candidates_are_few: &str,
    stages: &StageParams,
    bound: &[(&str, &dyn ToSql)],
) -> Result<bool, Error> {
    let mut params = stages.named().to_vec();
    params.push((":few", &FEW_SERIES));
    params.extend_from_slice(bound);
    Ok(connection
        .prepare_cached(candidates_are_few)?
        .query_row(params.as_slice(), |row| row.get(0))?)
}

#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    use super::*;
    use crate::{Database, letter_case::add_fold_case, scratch::ScratchLibrary};

    const READ_AT_MS: i64 = 1;
    const FORGOTTEN: SeriesFilter =
        SeriesFilter::NONE.with_last_read_before_ms(Some(READ_AT_MS + 1));
    const DUPLICATED: SeriesFilter = SeriesFilter::NONE.with_duplicates(Inclusion::Only);
    const PAGES_LEFT_AT_MOST: u32 = 60;
    const QUICK_READS: SeriesFilter =
        SeriesFilter::NONE.with_pages_left_at_most(Some(PAGES_LEFT_AT_MOST));
    const FEW_PAGES_LEFT: i64 = 10;
    const MANY_PAGES_LEFT: i64 = 1_000;
    const UNSTARTED: (i64, i64) = (0, 0);
    const IN_PROGRESS: (i64, i64) = (0, 1);
    const FINISHED: (i64, i64) = (1, 0);

    struct Library {
        _scratch: ScratchLibrary,
        connection: Connection,
    }

    impl Library {
        fn read_and_copied(name: &str, series_count: i64) -> Self {
            let scratch = ScratchLibrary::new(name);
            drop(Database::open(&scratch.config).unwrap());
            let connection = Connection::open(&scratch.config.path).unwrap();
            add_fold_case(&connection).unwrap();
            connection
                .execute(
                    "WITH RECURSIVE number (n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM number WHERE n < ?1)
                    INSERT INTO series (
                        id, source_id, natural_key, title, title_key, book_count, added_at_ms,
                        last_read_at_ms, duplicated_books
                    )
                    SELECT randomblob(16), randomblob(16), n, n, CAST(n AS BLOB), 1, n, ?2, 1
                    FROM number WHERE n <= ?1",
                    (series_count, READ_AT_MS),
                )
                .unwrap();
            Self {
                _scratch: scratch,
                connection,
            }
        }

        fn gathering(&self, filter: &SeriesFilter) -> Gathering {
            Gathering::of(&self.connection, filter).unwrap()
        }
    }

    fn counting_up_to_a_few(gathered: &str) -> [String; 3] {
        [
            "CO-ROUTINE (subquery-1)".to_owned(),
            gathered.to_owned(),
            "SCAN (subquery-1)".to_owned(),
        ]
    }

    fn only_unstarted() -> StageParams {
        StageParams::of(&SeriesFilter::NONE.with_started(Inclusion::Hide))
    }

    #[test]
    fn leaves_out_each_stage_holding_no_forgotten_series() {
        let library = Library::read_and_copied("stages-holding-forgotten", 3);

        let stages = stages_holding_matches(&library.connection, &FORGOTTEN).unwrap();

        assert_eq!(stages, only_unstarted());
    }

    #[test]
    fn leaves_out_each_stage_holding_no_series_with_a_book_stored_twice() {
        let library = Library::read_and_copied("stages-holding-duplicated", 3);

        let stages = stages_holding_matches(&library.connection, &DUPLICATED).unwrap();

        assert_eq!(stages, only_unstarted());
    }

    #[test]
    fn keeps_every_stage_the_filter_lets_through_without_a_smart_condition() {
        let library = Library::read_and_copied("stages-without-smart-filter", 3);

        let stages = stages_holding_matches(&library.connection, &SeriesFilter::NONE).unwrap();

        assert_eq!(stages, StageParams::of(&SeriesFilter::NONE));
    }

    #[test]
    fn reads_each_stage_in_order_without_a_smart_filter() {
        let library = Library::read_and_copied("gathering-unfiltered", 0);

        let gathering = library.gathering(&SeriesFilter::NONE);

        assert_eq!(gathering, Gathering::EachStageInOrder);
    }

    #[test]
    fn gathers_the_forgotten_series_while_they_are_few() {
        let library = Library::read_and_copied("gathering-few-forgotten", FEW_SERIES - 1);

        let gathering = library.gathering(&FORGOTTEN);

        assert_eq!(gathering, Gathering::FewForgotten);
    }

    #[test]
    fn reads_each_stage_in_order_once_the_forgotten_series_are_no_longer_few() {
        let library = Library::read_and_copied("gathering-many-forgotten", FEW_SERIES);

        let gathering = library.gathering(&FORGOTTEN);

        assert_eq!(gathering, Gathering::EachStageInOrder);
    }

    #[test]
    fn gathers_the_series_holding_a_book_stored_twice_while_they_are_few() {
        let library = Library::read_and_copied("gathering-few-duplicated", FEW_SERIES - 1);

        let gathering = library.gathering(&DUPLICATED);

        assert_eq!(gathering, Gathering::FewDuplicated);
    }

    #[test]
    fn reads_each_stage_in_order_once_the_series_holding_a_book_stored_twice_are_no_longer_few() {
        let library = Library::read_and_copied("gathering-many-duplicated", FEW_SERIES);

        let gathering = library.gathering(&DUPLICATED);

        assert_eq!(gathering, Gathering::EachStageInOrder);
    }

    impl Library {
        fn with_pages_left(self, pages_left: i64) -> Self {
            self.connection
                .execute("UPDATE series SET pages_left = ?1", [pages_left])
                .unwrap();
            self
        }

        fn with_three_series_at(self, stages: [((i64, i64), i64); 3]) -> Self {
            for (local_id, ((read_count, started_count), pages_left)) in (1..).zip(stages) {
                self.connection
                    .execute(
                        "UPDATE series SET read_count = ?2, started_count = ?3, pages_left = ?4
                        WHERE local_id = ?1",
                        (local_id, read_count, started_count, pages_left),
                    )
                    .unwrap();
            }
            self
        }
    }

    fn only_in_progress() -> StageParams {
        StageParams::of(
            &SeriesFilter::NONE
                .with_started(Inclusion::Only)
                .with_finished(Inclusion::Hide),
        )
    }

    #[test]
    fn leaves_out_the_finished_stage_and_each_stage_holding_no_quick_read() {
        let library = Library::read_and_copied("stages-holding-quick-reads", 3)
            .with_three_series_at([
                (UNSTARTED, FEW_PAGES_LEFT),
                (IN_PROGRESS, MANY_PAGES_LEFT),
                (FINISHED, 0),
            ]);

        let stages = stages_holding_matches(&library.connection, &QUICK_READS).unwrap();

        assert_eq!(stages, only_unstarted());
    }

    #[test]
    fn keeps_the_in_progress_stage_holding_a_quick_read_beside_unstarted_long_books() {
        let library = Library::read_and_copied("stages-holding-in-progress-quick-read", 3)
            .with_three_series_at([
                (UNSTARTED, MANY_PAGES_LEFT),
                (IN_PROGRESS, FEW_PAGES_LEFT),
                (FINISHED, 0),
            ]);

        let stages = stages_holding_matches(&library.connection, &QUICK_READS).unwrap();

        assert_eq!(stages, only_in_progress());
    }

    #[test]
    fn leaves_out_a_stage_holding_only_series_with_books_not_yet_counted() {
        let library =
            Library::read_and_copied("stages-holding-uncounted", 3).with_three_series_at([
                (UNSTARTED, FEW_PAGES_LEFT),
                (IN_PROGRESS, FEW_PAGES_LEFT),
                (FINISHED, 0),
            ]);
        library
            .connection
            .execute(
                "UPDATE series SET uncounted_books = 1 WHERE local_id = 1",
                [],
            )
            .unwrap();

        let stages = stages_holding_matches(&library.connection, &QUICK_READS).unwrap();

        assert_eq!(stages, only_in_progress());
    }

    #[test]
    fn gathers_the_quick_reads_while_they_are_few() {
        let library = Library::read_and_copied("gathering-few-quick-reads", FEW_SERIES - 1)
            .with_pages_left(FEW_PAGES_LEFT);

        let gathering = library.gathering(&QUICK_READS);

        assert_eq!(gathering, Gathering::FewQuickReads);
    }

    #[test]
    fn reads_each_stage_in_order_once_the_quick_reads_are_no_longer_few() {
        let library = Library::read_and_copied("gathering-many-quick-reads", FEW_SERIES)
            .with_pages_left(FEW_PAGES_LEFT);

        let gathering = library.gathering(&QUICK_READS);

        assert_eq!(gathering, Gathering::EachStageInOrder);
    }

    #[test]
    fn does_not_count_a_series_with_no_pages_left_among_the_quick_reads() {
        let library = Library::read_and_copied("gathering-nothing-left-to-read", FEW_SERIES);

        let gathering = library.gathering(&QUICK_READS);

        assert_eq!(gathering, Gathering::FewQuickReads);
    }

    impl Library {
        fn in_language(self, language: &str) -> Self {
            self.connection
                .execute(
                    "UPDATE series SET language = ?1, language_source = 'files'",
                    [language],
                )
                .unwrap();
            self
        }
    }

    fn in_japanese() -> SeriesFilter {
        SeriesFilter::NONE.with_languages(vec!["ja".to_owned()])
    }

    #[test]
    fn gathers_the_series_in_a_chosen_language_while_they_are_few() {
        let library =
            Library::read_and_copied("gathering-few-in-language", FEW_SERIES - 1).in_language("ja");

        let gathering = library.gathering(&in_japanese());

        assert_eq!(gathering, Gathering::FewInLanguages);
    }

    #[test]
    fn reads_each_stage_in_order_once_the_series_in_a_chosen_language_are_no_longer_few() {
        let library =
            Library::read_and_copied("gathering-many-in-language", FEW_SERIES).in_language("ja");

        let gathering = library.gathering(&in_japanese());

        assert_eq!(gathering, Gathering::EachStageInOrder);
    }

    impl Library {
        fn with_tagged_books(self, count: i64) -> Self {
            self.connection
                .execute_batch(&format!(
                    "INSERT INTO book (id, series_local_id, title, reading_order_key, added_at_ms)
                    SELECT randomblob(16), local_id, 'Volume 01', x'01', 0 FROM series
                    ORDER BY local_id LIMIT {count};
                    INSERT INTO book_details (book_id) SELECT id FROM book;
                    INSERT INTO book_tag (book_id, kind, name) SELECT id, 'tag', 'storms' FROM book;"
                ))
                .unwrap();
            self
        }
    }

    fn tagged_storms() -> SeriesFilter {
        SeriesFilter::NONE.with_tags(vec!["storms".to_owned()])
    }

    #[test]
    fn gathers_the_series_carrying_a_chosen_tag_while_they_are_few() {
        let library = Library::read_and_copied("gathering-few-tagged", FEW_TAGGED_SERIES + 100)
            .with_tagged_books(FEW_TAGGED_SERIES - 1);

        let gathering = library.gathering(&tagged_storms());

        assert_eq!(gathering, Gathering::FewTagged);
    }

    #[test]
    fn reads_each_stage_in_order_once_the_series_carrying_a_chosen_tag_are_no_longer_few() {
        let library = Library::read_and_copied("gathering-many-tagged", FEW_TAGGED_SERIES + 100)
            .with_tagged_books(FEW_TAGGED_SERIES);

        let gathering = library.gathering(&tagged_storms());

        assert_eq!(gathering, Gathering::EachStageInOrder);
    }

    fn bookmarked_only() -> SeriesFilter {
        SeriesFilter::NONE.with_bookmarked(Inclusion::Only)
    }

    #[test]
    fn gathers_the_bookmarked_series_while_they_are_few() {
        let library = Library::read_and_copied("gathering-few-bookmarked", FEW_SERIES - 1);
        library
            .connection
            .execute("UPDATE series SET bookmarked_books = 1", [])
            .unwrap();

        let gathering = library.gathering(&bookmarked_only());

        assert_eq!(gathering, Gathering::FewBookmarked);
    }

    #[test]
    fn reads_each_stage_in_order_once_the_bookmarked_series_are_no_longer_few() {
        let library = Library::read_and_copied("gathering-many-bookmarked", FEW_SERIES);
        library
            .connection
            .execute("UPDATE series SET bookmarked_books = 1", [])
            .unwrap();

        let gathering = library.gathering(&bookmarked_only());

        assert_eq!(gathering, Gathering::EachStageInOrder);
    }

    #[test]
    fn reads_each_stage_in_order_for_the_series_without_a_bookmark_whatever_few_hold_one() {
        let library = Library::read_and_copied("gathering-unbookmarked", 3);

        let gathering = library.gathering(&SeriesFilter::NONE.with_bookmarked(Inclusion::Hide));

        assert_eq!(gathering, Gathering::EachStageInOrder);
    }

    fn manga_only() -> SeriesFilter {
        SeriesFilter::NONE.with_formats(vec![SeriesFormat::Manga])
    }

    #[test]
    fn gathers_the_manga_series_while_they_are_few() {
        let library = Library::read_and_copied("gathering-few-manga", FEW_SERIES - 1);
        library
            .connection
            .execute("UPDATE series SET manga_books = 1", [])
            .unwrap();

        let gathering = library.gathering(&manga_only());

        assert_eq!(gathering, Gathering::FewManga);
    }

    #[test]
    fn reads_each_stage_in_order_once_the_manga_series_are_no_longer_few() {
        let library = Library::read_and_copied("gathering-many-manga", FEW_SERIES);
        library
            .connection
            .execute("UPDATE series SET manga_books = 1", [])
            .unwrap();

        let gathering = library.gathering(&manga_only());

        assert_eq!(gathering, Gathering::EachStageInOrder);
    }

    #[test]
    fn reads_each_stage_in_order_for_the_comics_whatever_few_series_are_manga() {
        let library = Library::read_and_copied("gathering-comics", 3);

        let gathering =
            library.gathering(&SeriesFilter::NONE.with_formats(vec![SeriesFormat::Comic]));

        assert_eq!(gathering, Gathering::EachStageInOrder);
    }

    #[test]
    fn gathers_the_series_rated_18_plus_while_they_are_few() {
        let library = Library::read_and_copied("gathering-few-adult", FEW_SERIES - 1);
        library
            .connection
            .execute("UPDATE series SET adult_rated_books = 1", [])
            .unwrap();

        let gathering = library.gathering(&SeriesFilter::NONE.with_adult(Inclusion::Only, true));

        assert_eq!(gathering, Gathering::FewRatedAdult);
    }

    #[test]
    fn reads_each_stage_in_order_when_hiding_the_series_holding_a_book_stored_twice() {
        let library = Library::read_and_copied("gathering-hidden-duplicated", 0);

        let gathering = library.gathering(&SeriesFilter::NONE.with_duplicates(Inclusion::Hide));

        assert_eq!(gathering, Gathering::EachStageInOrder);
    }

    #[test]
    fn counts_the_series_in_a_chosen_language_through_the_language_index_up_to_a_few() {
        let scratch = ScratchLibrary::new("languages-are-few-plan");

        let plan = scratch.query_plan(LANGUAGES_ARE_FEW);

        assert_eq!(
            plan,
            [
                "CO-ROUTINE (subquery-2)",
                "SEARCH series USING INDEX series_by_language (language=? AND reading_stage=?)",
                "LIST SUBQUERY 1",
                "SCAN json_each VIRTUAL TABLE INDEX 1:",
                "SCAN (subquery-2)",
            ]
        );
    }

    #[test]
    fn counts_the_series_carrying_a_chosen_tag_through_the_tag_index_up_to_a_few() {
        let scratch = ScratchLibrary::new("tagged-are-few-plan");

        let plan = scratch.query_plan(TAGGED_ARE_FEW);

        assert_eq!(
            plan,
            [
                "CO-ROUTINE (subquery-2)",
                "SEARCH series_tag USING COVERING INDEX series_tag_by_name (name=?)",
                "LIST SUBQUERY 1",
                "SCAN json_each VIRTUAL TABLE INDEX 1:",
                "SCAN (subquery-2)",
            ]
        );
    }

    #[test]
    fn counts_the_manga_series_through_their_own_index_up_to_a_few() {
        let scratch = ScratchLibrary::new("manga-are-few-plan");

        let plan = scratch.query_plan(MANGA_ARE_FEW);

        assert_eq!(
            plan,
            counting_up_to_a_few(
                "SEARCH series USING INDEX series_manga_by_stage (reading_stage=?)"
            )
        );
    }

    #[test]
    fn counts_the_bookmarked_series_through_their_own_index_up_to_a_few() {
        let scratch = ScratchLibrary::new("bookmarked-are-few-plan");

        let plan = scratch.query_plan(BOOKMARKED_ARE_FEW);

        assert_eq!(
            plan,
            counting_up_to_a_few(
                "SEARCH series USING INDEX series_bookmarked_by_stage (reading_stage=?)"
            )
        );
    }

    #[test]
    fn counts_the_series_rated_18_plus_through_their_own_index_up_to_a_few() {
        let scratch = ScratchLibrary::new("rated-adult-are-few-plan");

        let plan = scratch.query_plan(RATED_ADULT_ARE_FEW);

        assert_eq!(
            plan,
            counting_up_to_a_few(
                "SEARCH series USING INDEX series_rated_adult_by_stage (reading_stage=?)"
            )
        );
    }

    #[test]
    fn looks_for_a_forgotten_series_at_one_stage_through_when_each_was_last_read() {
        let scratch = ScratchLibrary::new("forgotten-at-stage-plan");

        let plan = scratch.query_plan(FORGOTTEN_AT_STAGE);

        assert_eq!(
            plan,
            [
                "SCAN CONSTANT ROW",
                "SCALAR SUBQUERY 1",
                "SEARCH series USING INDEX series_by_stage_and_last_read (reading_stage=? AND last_read_at_ms>? AND last_read_at_ms<?)",
            ]
        );
    }

    #[test]
    fn looks_for_a_series_holding_a_book_stored_twice_at_one_stage_through_their_own_index() {
        let scratch = ScratchLibrary::new("duplicated-at-stage-plan");

        let plan = scratch.query_plan(DUPLICATED_AT_STAGE);

        assert_eq!(
            plan,
            [
                "SCAN CONSTANT ROW",
                "SCALAR SUBQUERY 1",
                "SEARCH series USING INDEX series_with_duplicates_by_stage (reading_stage=?)",
            ]
        );
    }

    #[test]
    fn looks_for_a_quick_read_at_one_stage_through_the_pages_left_index() {
        let scratch = ScratchLibrary::new("quick-at-stage-plan");

        let plan = scratch.query_plan(QUICK_AT_STAGE);

        assert_eq!(
            plan,
            [
                "SCAN CONSTANT ROW",
                "SCALAR SUBQUERY 1",
                "SEARCH series USING INDEX series_by_stage_and_time_left (reading_stage=? AND time_left_key>? AND time_left_key<?)",
            ]
        );
    }

    #[test]
    fn counts_the_quick_reads_through_the_pages_left_index_up_to_a_few() {
        let scratch = ScratchLibrary::new("quick-are-few-plan");

        let plan = scratch.query_plan(QUICK_ARE_FEW);

        assert_eq!(
            plan,
            counting_up_to_a_few(
                "SEARCH series USING INDEX series_by_stage_and_time_left (reading_stage=? AND time_left_key>? AND time_left_key<?)"
            )
        );
    }

    #[test]
    fn counts_the_forgotten_series_through_when_each_was_last_read_up_to_a_few() {
        let scratch = ScratchLibrary::new("forgotten-are-few-plan");

        let plan = scratch.query_plan(FORGOTTEN_ARE_FEW);

        assert_eq!(
            plan,
            counting_up_to_a_few(
                "SEARCH series USING INDEX series_by_stage_and_last_read (reading_stage=? AND last_read_at_ms>? AND last_read_at_ms<?)"
            )
        );
    }

    #[test]
    fn counts_the_series_holding_a_book_stored_twice_through_their_own_index_up_to_a_few() {
        let scratch = ScratchLibrary::new("duplicated-are-few-plan");

        let plan = scratch.query_plan(DUPLICATED_ARE_FEW);

        assert_eq!(
            plan,
            counting_up_to_a_few(
                "SEARCH series USING INDEX series_with_duplicates_by_stage (reading_stage=?)"
            )
        );
    }
}
