use rusqlite::{Connection, ToSql};

use super::{
    spelling_candidates::{SCAN, match_queries, read_window},
    spelling_slips::nearest_words,
};
use crate::{Error, adult_content::AdultHiding, letter_case::fold_case};

const MATCHES_UP_TO_COMMON: &str =
    "SELECT count(*) FROM (SELECT 1 FROM series_fts WHERE series_fts MATCH :query LIMIT :limit)";

const CANDIDATES: &str = concat!(
    "SELECT series.local_id, series.title
    FROM (SELECT rowid FROM series_fts WHERE series_fts MATCH :query ORDER BY rowid LIMIT :scan) AS hit
    CROSS JOIN series ON series.local_id = hit.rowid
    WHERE series.reading_stage IS NOT NULL AND NOT ",
    crate::adult_content::in_hidden_adult_series!("series"),
    "
    ORDER BY hit.rowid LIMIT :limit"
);

#[tracing::instrument(skip_all)]
pub fn closest_title_words(
    connection: &Connection,
    text: &str,
    hiding: AdultHiding,
) -> Result<Option<String>, Error> {
    let typed = fold_case(text);
    let queries = match_queries(connection, MATCHES_UP_TO_COMMON, &typed)?;
    let typed: Vec<char> = typed.chars().collect();
    Ok(candidates(connection, &queries, hiding)?
        .into_iter()
        .filter_map(|(series, title)| {
            let (slips, words) = nearest_words(&typed, &title)?;
            Some(((slips, series), words))
        })
        .min_by_key(|(nearness, _)| *nearness)
        .map(|(_, words)| words))
}

fn candidates(
    connection: &Connection,
    queries: &[String],
    hiding: AdultHiding,
) -> Result<Vec<(i64, String)>, Error> {
    let [leaves_out, counts] = hiding.params();
    let mut statement = connection.prepare(CANDIDATES)?;
    read_window(
        queries,
        |(series, _)| *series,
        |query, limit| {
            let rows = statement
                .query_map(
                    &[
                        (":query", &query as &dyn ToSql),
                        (":scan", &SCAN),
                        (":limit", &limit),
                        leaves_out,
                        counts,
                    ][..],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        },
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scratch::ScratchLibrary;

    #[test]
    fn reads_the_candidates_from_a_bounded_run_of_the_title_index_then_each_series_by_its_key() {
        let scratch = ScratchLibrary::new("closest-title-plan");

        let plan = scratch.query_plan(CANDIDATES);

        assert_eq!(
            plan,
            [
                "CO-ROUTINE hit",
                "SCAN series_fts VIRTUAL TABLE INDEX 64:M1",
                "SCAN hit",
                "SEARCH series USING INTEGER PRIMARY KEY (rowid=?)",
            ]
        );
    }

    #[test]
    fn probes_a_trigram_through_the_title_index_alone() {
        let scratch = ScratchLibrary::new("closest-title-probe-plan");

        let plan = scratch.query_plan(MATCHES_UP_TO_COMMON);

        assert_eq!(
            plan,
            [
                "CO-ROUTINE (subquery-1)",
                "SCAN series_fts VIRTUAL TABLE INDEX 0:M1",
                "SCAN (subquery-1)",
            ]
        );
    }
}
