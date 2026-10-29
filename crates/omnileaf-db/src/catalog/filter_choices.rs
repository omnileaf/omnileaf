use rusqlite::Connection;

use crate::{
    Error,
    adult_content::{AdultHiding, in_hidden_adult_series},
    catalog::SeriesFormat,
};

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
const LANGUAGES_OF_SHOWN_SERIES: &str = concat!(
    "SELECT DISTINCT language FROM series
    WHERE book_count > 0 AND language IS NOT NULL AND NOT ",
    in_hidden_adult_series!("series"),
    " ORDER BY language"
);
const HOLDS_SHOWN_MANGA: &str = concat!(
    "SELECT EXISTS (
    SELECT 1 FROM series
    WHERE manga_books > 0 AND reading_stage IS NOT NULL AND NOT ",
    in_hidden_adult_series!("series"),
    ")"
);
const HOLDS_SHOWN_COMICS: &str = concat!(
    "SELECT EXISTS (
    SELECT 1 FROM series
    WHERE manga_books = 0 AND reading_stage IS NOT NULL AND NOT ",
    in_hidden_adult_series!("series"),
    ")"
);
const TAGS_OF_SHOWN_SERIES: &str = concat!(
    "SELECT DISTINCT series_tag.name FROM series_tag
    JOIN series ON series.local_id = series_tag.series_local_id
    WHERE NOT ",
    in_hidden_adult_series!("series"),
    " ORDER BY series_tag.name COLLATE NOCASE, series_tag.name"
);
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
pub fn filter_choices(
    connection: &Connection,
    hiding: AdultHiding,
) -> Result<FilterChoices, Error> {
    let (comics, manga, languages, tags) = if hiding.leaves_out_adult {
        (
            HOLDS_SHOWN_COMICS,
            HOLDS_SHOWN_MANGA,
            LANGUAGES_OF_SHOWN_SERIES,
            TAGS_OF_SHOWN_SERIES,
        )
    } else {
        (HOLDS_COMICS, HOLDS_MANGA, LANGUAGES, TAGS)
    };
    let holds = |sql| {
        connection.query_row(sql, &hiding.params_while_hiding()[..], |row| {
            row.get::<_, bool>(0)
        })
    };
    let formats = [(SeriesFormat::Comic, comics), (SeriesFormat::Manga, manga)];
    let mut offered = Vec::new();
    for (format, sql) in formats {
        if holds(sql)? {
            offered.push(format);
        }
    }
    Ok(FilterChoices {
        formats: offered,
        languages: names(connection, languages, hiding)?,
        tags: names(connection, tags, hiding)?,
        holds_rated_adult: connection.query_row(HOLDS_RATED_ADULT, [], |row| row.get(0))?,
        holds_marked_adult: connection.query_row(HOLDS_MARKED_ADULT, [], |row| row.get(0))?,
    })
}

fn names(connection: &Connection, sql: &str, hiding: AdultHiding) -> Result<Vec<String>, Error> {
    Ok(connection
        .prepare(sql)?
        .query_map(&hiding.params_while_hiding()[..], |row| row.get(0))?
        .collect::<Result<_, _>>()?)
}
