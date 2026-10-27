use rusqlite::{Connection, ToSql};

use crate::{
    Error,
    catalog::{
        series_listing::{Inclusion, SeriesFilter, SortDirection, StageParams},
        series_page::Directions,
        staged_rows::Listing,
    },
};

const FEW_SERIES: i64 = 400;

/// SQLite's planner prefers walking a sort order's index on from a cursor over sorting a few series, so the candidates name the index that finds them.
macro_rules! candidates {
    (index: $index:literal, condition: $condition:literal $(,)?) => {
        concat!(
            " FROM series INDEXED BY ",
            $index,
            " WHERE series.reading_stage IN (:unstarted, :in_progress, :finished) AND ",
            $condition
        )
    };
}

macro_rules! forgotten_candidates {
    () => {
        $crate::catalog::gathering::candidates! {
            index: "series_by_stage_and_last_read",
            condition: "series.last_read_at_ms > 0 AND series.last_read_at_ms < :last_read_before_ms",
        }
    };
}

macro_rules! duplicated_candidates {
    () => {
        $crate::catalog::gathering::candidates! {
            index: "series_with_duplicates_by_stage",
            condition: "series.duplicated_books > 0",
        }
    };
}

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

/// SQLite works out every result column of a row before sorting it, so only the keys are sorted and the page's other columns read afterwards.
macro_rules! sorted_page {
    (candidates: $candidates:expr, seek: $seek:expr, order: $order:expr $(,)?) => {
        concat!(
            "WITH page AS MATERIALIZED (SELECT series.local_id",
            $candidates,
            $crate::catalog::series_listing::smart_conditions!(),
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
        $crate::catalog::series_page::Directions {
            ascending: $crate::catalog::staged_rows::Listing {
                first_page_query: $crate::catalog::gathering::sorted_page! {
                    candidates: $candidates,
                    seek: "",
                    order: concat!($key, ", id"),
                },
                next_page_query: $crate::catalog::gathering::sorted_page! {
                    candidates: $candidates,
                    seek: concat!(" AND (series.", $key, ", series.id) > (:after_key, :after_id)"),
                    order: concat!($key, ", id"),
                },
                sort_position: $position,
            },
            descending: $crate::catalog::staged_rows::Listing {
                first_page_query: $crate::catalog::gathering::sorted_page! {
                    candidates: $candidates,
                    seek: "",
                    order: concat!($key, " DESC, id DESC"),
                },
                next_page_query: $crate::catalog::gathering::sorted_page! {
                    candidates: $candidates,
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
        }
    };
}

pub(crate) use candidates;
pub(crate) use duplicated_candidates;
pub(crate) use forgotten_candidates;
pub(crate) use gatherings;
pub(crate) use sorted_directions;
pub(crate) use sorted_page;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Gathering {
    EachStageInOrder,
    FewForgotten,
    FewDuplicated,
}

pub(crate) struct Gatherings<P> {
    pub(crate) each_stage_in_order: Directions<P>,
    pub(crate) few_forgotten: Directions<P>,
    pub(crate) few_duplicated: Directions<P>,
}

impl Gathering {
    pub(crate) fn of(connection: &Connection, filter: SeriesFilter) -> Result<Self, Error> {
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
        }
    }
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
        .prepare(candidates_are_few)?
        .query_row(params.as_slice(), |row| row.get(0))?)
}

#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    use super::*;
    use crate::{Database, letter_case::add_fold_case, scratch::ScratchLibrary};

    const READ_AT_MS: i64 = 1;
    const FORGOTTEN: SeriesFilter = SeriesFilter {
        last_read_before_ms: Some(READ_AT_MS + 1),
        ..SeriesFilter::NONE
    };
    const DUPLICATED: SeriesFilter = SeriesFilter {
        duplicates: Inclusion::Only,
        ..SeriesFilter::NONE
    };

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

        fn gathering(&self, filter: SeriesFilter) -> Gathering {
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

    #[test]
    fn reads_each_stage_in_order_without_a_smart_filter() {
        let library = Library::read_and_copied("gathering-unfiltered", 0);

        let gathering = library.gathering(SeriesFilter::NONE);

        assert_eq!(gathering, Gathering::EachStageInOrder);
    }

    #[test]
    fn gathers_the_forgotten_series_while_they_are_few() {
        let library = Library::read_and_copied("gathering-few-forgotten", FEW_SERIES - 1);

        let gathering = library.gathering(FORGOTTEN);

        assert_eq!(gathering, Gathering::FewForgotten);
    }

    #[test]
    fn reads_each_stage_in_order_once_the_forgotten_series_are_no_longer_few() {
        let library = Library::read_and_copied("gathering-many-forgotten", FEW_SERIES);

        let gathering = library.gathering(FORGOTTEN);

        assert_eq!(gathering, Gathering::EachStageInOrder);
    }

    #[test]
    fn gathers_the_series_holding_a_book_stored_twice_while_they_are_few() {
        let library = Library::read_and_copied("gathering-few-duplicated", FEW_SERIES - 1);

        let gathering = library.gathering(DUPLICATED);

        assert_eq!(gathering, Gathering::FewDuplicated);
    }

    #[test]
    fn reads_each_stage_in_order_once_the_series_holding_a_book_stored_twice_are_no_longer_few() {
        let library = Library::read_and_copied("gathering-many-duplicated", FEW_SERIES);

        let gathering = library.gathering(DUPLICATED);

        assert_eq!(gathering, Gathering::EachStageInOrder);
    }

    #[test]
    fn reads_each_stage_in_order_when_hiding_the_series_holding_a_book_stored_twice() {
        let library = Library::read_and_copied("gathering-hidden-duplicated", 0);

        let gathering = library.gathering(SeriesFilter {
            duplicates: Inclusion::Hide,
            ..SeriesFilter::NONE
        });

        assert_eq!(gathering, Gathering::EachStageInOrder);
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
