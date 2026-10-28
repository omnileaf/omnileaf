use rusqlite::Connection;

use crate::Error;

const LANGUAGES: &str = "SELECT DISTINCT language FROM series
    WHERE book_count > 0 AND language IS NOT NULL
    ORDER BY language";
const TAGS: &str = "SELECT DISTINCT name FROM book_tag ORDER BY name COLLATE NOCASE, name";
const HOLDS_RATED_ADULT: &str = "SELECT EXISTS (
    SELECT 1 FROM series WHERE adult_rated_books > 0 AND reading_stage IS NOT NULL
)";

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct FilterChoices {
    pub languages: Vec<String>,
    pub tags: Vec<String>,
    /// Holds a listed series whose files rate a book 18+.
    pub holds_rated_adult: bool,
}

#[tracing::instrument(skip_all)]
pub fn filter_choices(connection: &Connection) -> Result<FilterChoices, Error> {
    Ok(FilterChoices {
        languages: names(connection, LANGUAGES)?,
        tags: names(connection, TAGS)?,
        holds_rated_adult: connection.query_row(HOLDS_RATED_ADULT, [], |row| row.get(0))?,
    })
}

fn names(connection: &Connection, sql: &str) -> Result<Vec<String>, Error> {
    Ok(connection
        .prepare(sql)?
        .query_map([], |row| row.get(0))?
        .collect::<Result<_, _>>()?)
}
