use rusqlite::{Connection, ToSql};

use super::{
    spelling_candidates::{match_queries, read_window},
    spelling_slips::nearest_words,
};
use crate::{Error, adult_content::AdultHiding, letter_case::fold_case};

macro_rules! titles_of_shown_series_matching {
    () => {
        concat!(
            "series_fts
            CROSS JOIN series ON series.local_id = series_fts.rowid
            WHERE series_fts MATCH :query AND series.reading_stage IS NOT NULL AND NOT ",
            crate::adult_content::in_hidden_adult_series!("series")
        )
    };
}

const MATCHES_UP_TO_COMMON: &str = concat!(
    "SELECT count(*) FROM (SELECT 1 FROM ",
    titles_of_shown_series_matching!(),
    " LIMIT :limit)"
);

const CANDIDATES: &str = concat!(
    "SELECT series.local_id, series.title FROM ",
    titles_of_shown_series_matching!(),
    " ORDER BY series_fts.rowid LIMIT :limit"
);

#[tracing::instrument(skip_all)]
pub fn closest_title_words(
    connection: &Connection,
    text: &str,
    hiding: AdultHiding,
) -> Result<Option<String>, Error> {
    let typed = fold_case(text);
    let queries = match_queries(connection, MATCHES_UP_TO_COMMON, &typed, hiding)?;
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
    fn reads_the_candidates_from_the_title_index_in_key_order_then_each_series_by_its_key() {
        let scratch = ScratchLibrary::new("closest-title-plan");

        let plan = scratch.query_plan(CANDIDATES);

        assert_eq!(
            plan,
            [
                "SCAN series_fts VIRTUAL TABLE INDEX 64:M1",
                "SEARCH series USING INTEGER PRIMARY KEY (rowid=?)",
            ]
        );
    }

    #[test]
    fn probes_a_trigram_through_the_title_index_and_each_series_by_its_key() {
        let scratch = ScratchLibrary::new("closest-title-probe-plan");

        let plan = scratch.query_plan(MATCHES_UP_TO_COMMON);

        assert_eq!(
            plan,
            [
                "CO-ROUTINE (subquery-1)",
                "SCAN series_fts VIRTUAL TABLE INDEX 0:M1",
                "SEARCH series USING INTEGER PRIMARY KEY (rowid=?)",
                "SCAN (subquery-1)",
            ]
        );
    }
}
