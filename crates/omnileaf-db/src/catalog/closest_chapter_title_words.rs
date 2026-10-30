use rusqlite::{Connection, ToSql};

use super::{
    spelling_candidates::{match_queries, read_window},
    spelling_slips::nearest_words,
};
use crate::{Error, adult_content::AdultHiding, letter_case::fold_case};

macro_rules! titles_of_shown_books_matching {
    () => {
        concat!(
            "book_title_fts
            CROSS JOIN book_title_search ON book_title_search.id = book_title_fts.rowid
            CROSS JOIN book ON book.id = book_title_search.book_id
            CROSS JOIN series ON series.local_id = book.series_local_id
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
    "SELECT book_title_search.id, book_title_search.title, series.title FROM ",
    titles_of_shown_books_matching!(),
    " ORDER BY book_title_fts.rowid LIMIT :limit"
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
    let queries = match_queries(connection, MATCHES_UP_TO_COMMON, &typed, hiding)?;
    let typed: Vec<char> = typed.chars().collect();
    Ok(candidates(connection, &queries, hiding)?
        .into_iter()
        .filter_map(|(book, chapter_title, series_title)| {
            let (slips, chapter_words) = nearest_words(&typed, &chapter_title)?;
            Some((
                (slips, book),
                ChapterSuggestion {
                    chapter_words,
                    series_title,
                },
            ))
        })
        .min_by_key(|(nearness, _)| *nearness)
        .map(|(_, suggestion)| suggestion))
}

fn candidates(
    connection: &Connection,
    queries: &[String],
    hiding: AdultHiding,
) -> Result<Vec<(i64, String, String)>, Error> {
    let [leaves_out, counts] = hiding.params();
    let mut statement = connection.prepare(CANDIDATES)?;
    read_window(
        queries,
        |(book, _, _)| *book,
        |query, limit| {
            let rows = statement
                .query_map(
                    &[
                        (":query", &query as &dyn ToSql),
                        (":limit", &limit),
                        leaves_out,
                        counts,
                    ][..],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
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
    fn reads_the_candidates_from_the_title_index_in_key_order_then_each_book_by_its_key() {
        let scratch = ScratchLibrary::new("chapter-title-candidates-plan");

        let plan = scratch.query_plan(CANDIDATES);

        assert_eq!(
            plan,
            [
                "SCAN book_title_fts VIRTUAL TABLE INDEX 64:M1",
                "SEARCH book_title_search USING INTEGER PRIMARY KEY (rowid=?)",
                "SEARCH book USING PRIMARY KEY (id=?)",
                "SEARCH series USING INTEGER PRIMARY KEY (rowid=?)",
            ]
        );
    }
}
