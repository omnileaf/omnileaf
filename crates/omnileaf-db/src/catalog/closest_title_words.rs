use rusqlite::{Connection, ToSql};

use super::{
    rarest_trigrams::{WINDOW, rarest_trigrams},
    spelling_slips::nearest_words,
    spelling_trigrams::{any_trigram, typed_trigrams},
};
use crate::{Error, adult_content::AdultHiding, letter_case::fold_case};

macro_rules! titles_of_shown_series_matching {
    () => {
        concat!(
            "series_fts
            JOIN series ON series.local_id = series_fts.rowid
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
    "SELECT series.title FROM ",
    titles_of_shown_series_matching!(),
    " LIMIT :limit"
);

/// The words of a title nearest the text by a few typing slips, their letter case folded, for a search that found nothing.
#[tracing::instrument(skip_all)]
pub fn closest_title_words(
    connection: &Connection,
    text: &str,
    hiding: AdultHiding,
) -> Result<Option<String>, Error> {
    let typed = fold_case(text);
    let trigrams = rarest_trigrams(
        connection,
        MATCHES_UP_TO_COMMON,
        &typed_trigrams(&typed),
        hiding,
    )?;
    if trigrams.is_empty() {
        return Ok(None);
    }
    let typed: Vec<char> = typed.chars().collect();
    let [leaves_out, counts] = hiding.params();
    let query = any_trigram(&trigrams);
    let titles = connection
        .prepare(CANDIDATES)?
        .query_map(
            &[
                (":query", &query as &dyn ToSql),
                (":limit", &WINDOW),
                leaves_out,
                counts,
            ][..],
            |row| row.get::<_, String>(0),
        )?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(titles
        .iter()
        .filter_map(|title| nearest_words(&typed, title))
        .min_by_key(|(slips, _)| *slips)
        .map(|(_, words)| words))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scratch::ScratchLibrary;

    #[test]
    fn reads_the_candidates_from_the_title_index_unranked_then_each_series_by_its_key() {
        let scratch = ScratchLibrary::new("closest-title-plan");

        let plan = scratch.query_plan(CANDIDATES);

        assert_eq!(
            plan,
            [
                "SCAN series_fts VIRTUAL TABLE INDEX 0:M1",
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
