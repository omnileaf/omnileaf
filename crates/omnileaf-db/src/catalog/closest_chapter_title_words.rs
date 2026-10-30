use rusqlite::{Connection, ToSql};

use super::{
    closest_title_words::{any_trigram, nearest_words, typed_trigrams},
    rarest_trigrams::{WINDOW, rarest_trigrams},
};
use crate::{Error, adult_content::AdultHiding, letter_case::fold_case};

macro_rules! titles_of_shown_books_matching {
    () => {
        concat!(
            "book_title_fts
            JOIN book_title_search ON book_title_search.id = book_title_fts.rowid
            JOIN book ON book.id = book_title_search.book_id
            JOIN series ON series.local_id = book.series_local_id
            WHERE book_title_fts MATCH :query AND series.reading_stage IS NOT NULL AND NOT ",
            crate::adult_content::in_hidden_adult_series!("series")
        )
    };
}

const MATCHES_UP_TO_COMMON: &str = concat!(
    "SELECT count(*) FROM (SELECT 1 FROM ",
    titles_of_shown_books_matching!(),
    " LIMIT :limit)"
);

const CANDIDATES: &str = concat!(
    "SELECT book_title_search.title, series.title FROM ",
    titles_of_shown_books_matching!(),
    " LIMIT :limit"
);

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ChapterSuggestion {
    pub chapter_words: String,
    pub series_title: String,
}

#[tracing::instrument(skip_all)]
pub fn closest_chapter_title(
    connection: &Connection,
    text: &str,
    hiding: AdultHiding,
) -> Result<Option<ChapterSuggestion>, Error> {
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
    Ok(candidates(connection, &trigrams, hiding)?
        .into_iter()
        .filter_map(|(chapter_title, series_title)| {
            let (slips, chapter_words) = nearest_words(&typed, &chapter_title)?;
            Some((
                slips,
                ChapterSuggestion {
                    chapter_words,
                    series_title,
                },
            ))
        })
        .min_by_key(|(slips, _)| *slips)
        .map(|(_, suggestion)| suggestion))
}

fn candidates(
    connection: &Connection,
    trigrams: &[String],
    hiding: AdultHiding,
) -> Result<Vec<(String, String)>, Error> {
    let [leaves_out, counts] = hiding.params();
    let query = any_trigram(trigrams);
    let rows = connection
        .prepare(CANDIDATES)?
        .query_map(
            &[
                (":query", &query as &dyn ToSql),
                (":limit", &WINDOW),
                leaves_out,
                counts,
            ][..],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scratch::ScratchLibrary;

    #[test]
    fn probes_a_trigram_through_the_title_index_and_each_book_by_its_key() {
        let scratch = ScratchLibrary::new("chapter-title-probe-plan");

        let plan = scratch.query_plan(MATCHES_UP_TO_COMMON);

        assert_eq!(
            plan,
            [
                "CO-ROUTINE (subquery-1)",
                "SCAN book_title_fts VIRTUAL TABLE INDEX 0:M1",
                "SEARCH book_title_search USING INTEGER PRIMARY KEY (rowid=?)",
                "SEARCH book USING PRIMARY KEY (id=?)",
                "SEARCH series USING INTEGER PRIMARY KEY (rowid=?)",
                "SCAN (subquery-1)",
            ]
        );
    }

    #[test]
    fn reads_the_candidates_from_the_title_index_then_each_book_by_its_key() {
        let scratch = ScratchLibrary::new("chapter-title-candidates-plan");

        let plan = scratch.query_plan(CANDIDATES);

        assert_eq!(
            plan,
            [
                "SCAN book_title_fts VIRTUAL TABLE INDEX 0:M1",
                "SEARCH book_title_search USING INTEGER PRIMARY KEY (rowid=?)",
                "SEARCH book USING PRIMARY KEY (id=?)",
                "SEARCH series USING INTEGER PRIMARY KEY (rowid=?)",
            ]
        );
    }
}
