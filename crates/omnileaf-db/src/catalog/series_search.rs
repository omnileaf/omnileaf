use rusqlite::{Connection, ToSql};

use crate::{
    Error,
    catalog::{
        page::{Page, PageRequest},
        search_text::{Lookup, SearchText},
        series_listing::{SeriesFilter, StageParams},
        series_page::SeriesSummary,
        staged_rows::{Listing, Read, TitlePlace, listing, title_place, title_rows},
    },
};

/// Matches the phrases once for all three stages, rather than once in each.
const MATCHED: Listing<TitlePlace> = listing! {
    with: "WITH matched AS MATERIALIZED (
            SELECT rowid AS local_id FROM series_fts WHERE series_fts MATCH :phrases
        ) ",
    condition: " AND series.local_id IN matched",
    seek: "(series.title_key, series.id) > (:after_key, :after_id)",
    order: "title_key, id",
    sort_position: title_place,
};

const CONTAINING: Listing<TitlePlace> = listing! {
    with: "",
    condition: r" AND series.title LIKE :pattern ESCAPE '\'",
    seek: "(series.title_key, series.id) > (:after_key, :after_id)",
    order: "title_key, id",
    sort_position: title_place,
};

const MATCHED_COUNT: &str = "SELECT count(*) FROM series
    WHERE reading_stage IN (:unstarted, :in_progress, :finished)
        AND local_id IN (SELECT rowid FROM series_fts WHERE series_fts MATCH :phrases)";

const CONTAINING_COUNT: &str = r"SELECT count(*) FROM series
    WHERE reading_stage IN (:unstarted, :in_progress, :finished)
        AND title LIKE :pattern ESCAPE '\'";

/// Which series a search finds: those holding books whose titles hold its text, and of those the ones its filter lets through.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SeriesSearch {
    pub text: SearchText,
    pub filter: SeriesFilter,
}

/// Lists what the search finds in title order, carrying on from a title cursor as the library's own title list does.
#[tracing::instrument(skip_all, fields(filter = ?search.filter, size = ?request.size))]
pub fn search_page(
    connection: &Connection,
    search: &SeriesSearch,
    request: &PageRequest,
) -> Result<Page<SeriesSummary>, Error> {
    let lookup = &search.text.0;
    let bound = lookup.bound();
    let read = Read {
        connection,
        filter: search.filter,
        limit: request.size.rows_to_fetch(),
        bound: &bound,
    };
    let after = request.after.as_ref().map(|cursor| &cursor.0);
    let rows = title_rows(&read, lookup.listing(), after)?;
    Ok(Page::of(rows, request.size))
}

/// Counts the series [`search_page`] lists for the same search.
#[tracing::instrument(skip_all, fields(filter = ?search.filter))]
pub fn search_count(connection: &Connection, search: &SeriesSearch) -> Result<u32, Error> {
    let lookup = &search.text.0;
    let stages = StageParams::of(search.filter);
    let mut params = stages.named().to_vec();
    params.extend_from_slice(&lookup.bound());
    Ok(connection
        .prepare(lookup.count())?
        .query_row(params.as_slice(), |row| row.get(0))?)
}

impl Lookup {
    fn bound(&self) -> [(&'static str, &dyn ToSql); 1] {
        match self {
            Self::Phrases(query) => [(":phrases", query)],
            Self::Characters(pattern) => [(":pattern", pattern)],
        }
    }

    const fn listing(&self) -> &'static Listing<TitlePlace> {
        match self {
            Self::Phrases(_) => &MATCHED,
            Self::Characters(_) => &CONTAINING,
        }
    }

    const fn count(&self) -> &'static str {
        match self {
            Self::Phrases(_) => MATCHED_COUNT,
            Self::Characters(_) => CONTAINING_COUNT,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        catalog::staged_rows::plans::{merging, with_covers},
        scratch::ScratchLibrary,
    };

    const FIRST_TITLES: &str =
        "SEARCH series USING INDEX series_by_stage_and_title (reading_stage=?)";
    const TITLES_AFTER: &str = "SEARCH series USING INDEX series_by_stage_and_title (reading_stage=? AND (title_key,id)>(?,?))";
    const MATCH_PHRASES: &str = "SCAN series_fts VIRTUAL TABLE INDEX 0:M1";

    /// The numbers SQLite gives each stage's list of matched series, then its two cover subqueries, outer first.
    const SUBQUERIES_OF_EACH_MATCHED_STAGE: [(u8, (u8, u8)); 3] =
        [(5, (4, 2)), (10, (9, 7)), (15, (14, 12))];

    /// The numbers SQLite gives each stage's two cover subqueries, outer first.
    const COVER_SUBQUERIES_OF_EACH_STAGE: [(u8, u8); 3] = [(3, 1), (7, 5), (11, 9)];

    /// Matches the phrases once, then looks up each series a stage reads among those matched.
    fn matching_each_stage(series_step: &str) -> Vec<String> {
        merging(SUBQUERIES_OF_EACH_MATCHED_STAGE.map(|(list, covers)| {
            let matched_once: &[&str] = if list == SUBQUERIES_OF_EACH_MATCHED_STAGE[0].0 {
                &["MATERIALIZE matched", MATCH_PHRASES]
            } else {
                &[]
            };
            let steps = [series_step.to_owned(), format!("LIST SUBQUERY {list}")]
                .into_iter()
                .chain(matched_once.iter().map(|&step| step.to_owned()))
                .chain(["SCAN matched", "CREATE BLOOM FILTER"].map(ToOwned::to_owned))
                .collect();
            with_covers(steps, covers)
        }))
    }

    fn reading_each_stage(series_step: &str) -> Vec<String> {
        merging(
            COVER_SUBQUERIES_OF_EACH_STAGE
                .map(|covers| with_covers(vec![series_step.to_owned()], covers)),
        )
    }

    #[test]
    fn reads_the_phrases_matches_from_each_stage_s_stretch_of_the_title_index_without_sorting() {
        let scratch = ScratchLibrary::new("matched-plan");

        let plans = [
            scratch.query_plan(MATCHED.first_page_query),
            scratch.query_plan(MATCHED.next_page_query),
        ];

        assert_eq!(
            plans,
            [
                matching_each_stage(FIRST_TITLES),
                matching_each_stage(TITLES_AFTER)
            ]
        );
    }

    #[test]
    fn reads_titles_holding_a_few_characters_from_each_stage_s_stretch_of_the_title_index_without_sorting()
     {
        let scratch = ScratchLibrary::new("containing-plan");

        let plans = [
            scratch.query_plan(CONTAINING.first_page_query),
            scratch.query_plan(CONTAINING.next_page_query),
        ];

        assert_eq!(
            plans,
            [
                reading_each_stage(FIRST_TITLES),
                reading_each_stage(TITLES_AFTER)
            ]
        );
    }

    #[test]
    fn counts_through_the_stretches_of_an_index_holding_the_stages_the_filter_lets_through() {
        let scratch = ScratchLibrary::new("search-count-plan");

        let plans = [
            scratch.query_plan(MATCHED_COUNT),
            scratch.query_plan(CONTAINING_COUNT),
        ];

        let by_stage = "SEARCH series USING INDEX series_by_stage_and_added (reading_stage=?)";
        assert_eq!(
            plans,
            [
                vec![
                    by_stage,
                    "LIST SUBQUERY 1",
                    MATCH_PHRASES,
                    "CREATE BLOOM FILTER"
                ],
                vec![by_stage],
            ]
        );
    }
}
