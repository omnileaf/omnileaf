use rusqlite::{Connection, ToSql};

use crate::{
    Error,
    catalog::{
        page::{Page, PageRequest},
        search_text::{Lookup, SearchText},
        series_listing::{FilterParams, SeriesFilter, counted_conditions},
        series_page::SeriesSummary,
        staged_rows::{Listing, Read, TitlePlace, listing, title_place, title_rows},
    },
};

/// The series whose title, or one tag or one person's name, holds every phrase.
macro_rules! matching_series {
    () => {
        "SELECT rowid AS local_id FROM series_fts WHERE series_fts MATCH :phrases
        UNION ALL
        SELECT series_tag.series_local_id FROM search_name_fts
            JOIN search_name ON search_name.id = search_name_fts.rowid AND search_name.kind = 'tag'
            JOIN series_tag ON series_tag.name = search_name.name
            WHERE search_name_fts MATCH :phrases
        UNION ALL
        SELECT book.series_local_id FROM search_name_fts
            JOIN search_name ON search_name.id = search_name_fts.rowid AND search_name.kind = 'person'
            JOIN book_person ON book_person.name = search_name.name
            JOIN book ON book.id = book_person.book_id
            WHERE search_name_fts MATCH :phrases"
    };
}

/// Matches the phrases once for all three stages, rather than once in each.
const MATCHED: Listing<TitlePlace> = listing! {
    with: concat!("WITH matched AS MATERIALIZED (", matching_series!(), ") "),
    condition: " AND series.local_id IN matched",
    seek: "(series.title_key, series.id) > (:after_key, :after_id)",
    order: "title_key, id",
    sort_position: title_place,
};

const CONTAINING: Listing<TitlePlace> = listing! {
    with: "",
    condition: " AND instr(fold_case(series.title), :characters) > 0",
    seek: "(series.title_key, series.id) > (:after_key, :after_id)",
    order: "title_key, id",
    sort_position: title_place,
};

const MATCHED_COUNT: &str = concat!(
    "SELECT count(*) FROM series INDEXED BY series_by_stage_and_time_left
    WHERE reading_stage IN (:unstarted, :in_progress, :finished)
        AND local_id IN (",
    matching_series!(),
    ")",
    counted_conditions!()
);

const CONTAINING_COUNT: &str = concat!(
    "SELECT count(*) FROM series INDEXED BY series_by_stage_and_time_left
    WHERE reading_stage IN (:unstarted, :in_progress, :finished)
        AND instr(fold_case(title), :characters) > 0",
    counted_conditions!()
);

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SeriesSearch {
    pub text: SearchText,
    pub filter: SeriesFilter,
}

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
        filter: &search.filter,
        limit: request.size.rows_to_fetch(),
        bound: &bound,
    };
    let after = request.after.as_ref().map(|cursor| &cursor.0);
    let rows = title_rows(&read, lookup.listing(), after)?;
    Ok(Page::of(rows, request.size))
}

#[tracing::instrument(skip_all, fields(filter = ?search.filter))]
pub fn search_count(connection: &Connection, search: &SeriesSearch) -> Result<u32, Error> {
    let lookup = &search.text.0;
    let filter = FilterParams::of(&search.filter);
    let mut params = filter.named().to_vec();
    params.extend_from_slice(&lookup.bound());
    Ok(connection
        .prepare(lookup.count())?
        .query_row(params.as_slice(), |row| row.get(0))?)
}

impl Lookup {
    fn bound(&self) -> [(&'static str, &dyn ToSql); 1] {
        match self {
            Self::Phrases(query) => [(":phrases", query)],
            Self::Characters(characters) => [(":characters", characters)],
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
        catalog::staged_rows::plans::{
            continuing_from_the_book_up_next, merging, merging_each_stage, tag_list_steps,
            tag_probe_steps, with_covers,
        },
        scratch::ScratchLibrary,
    };

    const FIRST_TITLES: &str =
        "SEARCH series USING INDEX series_by_stage_and_title (reading_stage=?)";
    const TITLES_AFTER: &str = "SEARCH series USING INDEX series_by_stage_and_title (reading_stage=? AND (title_key,id)>(?,?))";
    const MATCHING_TITLES_TAGS_AND_PEOPLE: [&str; 12] = [
        "COMPOUND QUERY",
        "LEFT-MOST SUBQUERY",
        "SCAN series_fts VIRTUAL TABLE INDEX 0:M1",
        "UNION ALL",
        "SCAN search_name_fts VIRTUAL TABLE INDEX 0:M1",
        "SEARCH search_name USING INTEGER PRIMARY KEY (rowid=?)",
        "SEARCH series_tag USING COVERING INDEX series_tag_by_name (name=?)",
        "UNION ALL",
        "SCAN search_name_fts VIRTUAL TABLE INDEX 0:M1",
        "SEARCH search_name USING INTEGER PRIMARY KEY (rowid=?)",
        "SEARCH book_person USING COVERING INDEX book_person_by_name (name=?)",
        "SEARCH book USING PRIMARY KEY (id=?)",
    ];

    /// A count reads the list straight from the union, whose three parts each build a bloom filter.
    fn matching_titles_tags_and_people_for_a_count() -> Vec<String> {
        let bloom_filter_after = [2, 6, 11];
        MATCHING_TITLES_TAGS_AND_PEOPLE
            .iter()
            .enumerate()
            .flat_map(|(at, &step)| {
                let bloom = bloom_filter_after
                    .contains(&at)
                    .then_some("CREATE BLOOM FILTER");
                [Some(step), bloom].into_iter().flatten()
            })
            .map(ToOwned::to_owned)
            .collect()
    }

    /// The numbers SQLite gives each stage's list of series carrying a chosen tag, its list of matched series, then its two cover subqueries, outer first.
    const SUBQUERIES_OF_EACH_MATCHED_STAGE: [(u8, u8, (u8, u8)); 3] =
        [(8, 9, (6, 4)), (17, 18, (15, 13)), (24, 25, (22, 20))];
    const IN_PROGRESS_BOOK_UP_NEXT_SUBQUERIES: (u8, u8) = (11, 12);

    fn matching_each_stage(series_step: &str) -> Vec<String> {
        let [unstarted, in_progress, finished] = matched_stages(series_step);
        merging([
            unstarted,
            continuing_from_the_book_up_next(in_progress, IN_PROGRESS_BOOK_UP_NEXT_SUBQUERIES),
            finished,
        ])
    }

    fn matched_stages(series_step: &str) -> [Vec<String>; 3] {
        SUBQUERIES_OF_EACH_MATCHED_STAGE.map(|(tags, list, covers)| {
            let matched_once: Vec<&str> = if list == SUBQUERIES_OF_EACH_MATCHED_STAGE[0].1 {
                ["MATERIALIZE matched"]
                    .into_iter()
                    .chain(MATCHING_TITLES_TAGS_AND_PEOPLE)
                    .collect()
            } else {
                Vec::new()
            };
            let steps = [series_step.to_owned(), format!("LIST SUBQUERY {list}")]
                .into_iter()
                .chain(matched_once.iter().map(|&step| step.to_owned()))
                .chain(["SCAN matched", "CREATE BLOOM FILTER"].map(ToOwned::to_owned))
                .chain(tag_probe_steps(tags))
                .collect();
            with_covers(steps, covers)
        })
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
                merging_each_stage(FIRST_TITLES),
                merging_each_stage(TITLES_AFTER)
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

        let by_stage = "SEARCH series USING INDEX series_by_stage_and_time_left (reading_stage=?)";
        assert_eq!(
            plans,
            [
                [by_stage.to_owned(), "LIST SUBQUERY 3".to_owned(),]
                    .into_iter()
                    .chain(matching_titles_tags_and_people_for_a_count())
                    .chain(tag_list_steps(4))
                    .collect::<Vec<_>>(),
                [by_stage.to_owned()]
                    .into_iter()
                    .chain(tag_list_steps(1))
                    .collect::<Vec<_>>(),
            ]
        );
    }
}
