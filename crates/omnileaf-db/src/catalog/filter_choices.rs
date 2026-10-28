use rusqlite::Connection;

use crate::{Error, catalog::SeriesFormat};

const LANGUAGES: &str = "SELECT DISTINCT language FROM series
    WHERE book_count > 0 AND language IS NOT NULL
    ORDER BY language";
const HOLDS_MANGA: &str = "SELECT EXISTS (
    SELECT 1 FROM series WHERE manga_books > 0 AND reading_stage IS NOT NULL
)";
const HOLDS_COMICS: &str = "SELECT EXISTS (
    SELECT 1 FROM series WHERE manga_books = 0 AND reading_stage IS NOT NULL
)";
const TAGS: &str = "SELECT DISTINCT name FROM series_tag ORDER BY name COLLATE NOCASE, name";
const HOLDS_RATED_ADULT: &str = "SELECT EXISTS (
    SELECT 1 FROM series
    WHERE adult_rated_books - marked_adult > 0 AND reading_stage IS NOT NULL
)";
const HOLDS_MARKED_ADULT: &str = "SELECT EXISTS (
    SELECT 1 FROM series
    WHERE adult_rated_books > 0 AND marked_adult = 1 AND reading_stage IS NOT NULL
)";

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct FilterChoices {
    pub formats: Vec<SeriesFormat>,
    pub languages: Vec<String>,
    pub tags: Vec<String>,
    /// Holds a listed series whose files rate a book 18+.
    pub holds_rated_adult: bool,
    pub holds_marked_adult: bool,
}

#[tracing::instrument(skip_all)]
pub fn filter_choices(connection: &Connection) -> Result<FilterChoices, Error> {
    let holds = |sql| connection.query_row(sql, [], |row| row.get::<_, bool>(0));
    let formats = [
        (SeriesFormat::Comic, HOLDS_COMICS),
        (SeriesFormat::Manga, HOLDS_MANGA),
    ];
    let mut offered = Vec::new();
    for (format, sql) in formats {
        if holds(sql)? {
            offered.push(format);
        }
    }
    Ok(FilterChoices {
        formats: offered,
        languages: names(connection, LANGUAGES)?,
        tags: names(connection, TAGS)?,
        holds_rated_adult: connection.query_row(HOLDS_RATED_ADULT, [], |row| row.get(0))?,
        holds_marked_adult: connection.query_row(HOLDS_MARKED_ADULT, [], |row| row.get(0))?,
    })
}

fn names(connection: &Connection, sql: &str) -> Result<Vec<String>, Error> {
    Ok(connection
        .prepare(sql)?
        .query_map([], |row| row.get(0))?
        .collect::<Result<_, _>>()?)
}
