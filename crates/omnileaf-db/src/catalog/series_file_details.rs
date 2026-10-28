use omnileaf_sync_proto::SeriesId;
use rusqlite::{Connection, OptionalExtension};

use crate::{Error, catalog::PersonRole};

macro_rules! first_book_giving {
    ($column:literal) => {
        concat!(
            "(SELECT book_details.",
            $column,
            " FROM book
            JOIN book_details ON book_details.book_id = book.id
            WHERE book.series_local_id = series.local_id AND book_details.",
            $column,
            " IS NOT NULL
            ORDER BY book.reading_order_key, book.id
            LIMIT 1)"
        )
    };
}

const SUMMARY_AND_FORMAT: &str = concat!(
    "SELECT ",
    first_book_giving!("summary"),
    " AS summary, ",
    first_book_giving!("format"),
    " AS format FROM series WHERE id = ?1"
);
const PEOPLE: &str = "SELECT book_person.name, book_person.role FROM series
    JOIN book ON book.series_local_id = series.local_id
    JOIN book_person ON book_person.book_id = book.id
    WHERE series.id = ?1
    GROUP BY book_person.name, book_person.role
    ORDER BY book_person.name COLLATE NOCASE, book_person.name, book_person.role";
const SERIES_NAMING_PERSON: &str = "SELECT count(DISTINCT series.local_id) FROM book_person
    JOIN book ON book.id = book_person.book_id
    JOIN series ON series.local_id = book.series_local_id
    WHERE book_person.name = ?1 AND series.reading_stage IS NOT NULL";
const TAGS: &str = "SELECT DISTINCT book_tag.name FROM series
    JOIN book ON book.series_local_id = series.local_id
    JOIN book_tag ON book_tag.book_id = book.id
    WHERE series.id = ?1
    ORDER BY book_tag.name COLLATE NOCASE, book_tag.name";

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct SeriesFileDetails {
    pub summary: Option<String>,
    pub format: Option<String>,
    pub people: Vec<SeriesPerson>,
    pub tags: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SeriesPerson {
    pub name: String,
    pub roles: Vec<PersonRole>,
    pub series_count: u32,
}

#[tracing::instrument(skip_all, fields(%series))]
pub fn series_file_details(
    connection: &Connection,
    series: SeriesId,
) -> Result<SeriesFileDetails, Error> {
    let (summary, format) = connection
        .prepare(SUMMARY_AND_FORMAT)?
        .query_row([series.as_bytes()], |row| Ok((row.get(0)?, row.get(1)?)))
        .optional()?
        .unwrap_or_default();
    Ok(SeriesFileDetails {
        summary,
        format,
        people: people(connection, series)?,
        tags: connection
            .prepare(TAGS)?
            .query_map([series.as_bytes()], |row| row.get(0))?
            .collect::<Result<_, _>>()?,
    })
}

fn people(connection: &Connection, series: SeriesId) -> Result<Vec<SeriesPerson>, Error> {
    let named: Vec<(String, String)> = connection
        .prepare(PEOPLE)?
        .query_map([series.as_bytes()], |row| Ok((row.get(0)?, row.get(1)?)))?
        .collect::<Result<_, _>>()?;
    let mut counted = connection.prepare(SERIES_NAMING_PERSON)?;
    let mut people: Vec<SeriesPerson> = Vec::new();
    for (name, role) in named {
        let role = PersonRole::stored(role)?;
        match people.last_mut() {
            Some(person) if person.name == name => person.roles.push(role),
            _ => people.push(SeriesPerson {
                series_count: counted.query_row([&name], |row| row.get(0))?,
                name,
                roles: vec![role],
            }),
        }
    }
    Ok(people)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scratch::ScratchLibrary;

    #[test]
    fn finds_the_first_summary_and_format_of_a_series_through_its_books_in_order() {
        let scratch = ScratchLibrary::new("series-summary-plan");

        let plan = scratch.query_plan(SUMMARY_AND_FORMAT);

        assert_eq!(
            plan,
            [
                "SEARCH series USING COVERING INDEX sqlite_autoindex_series_1 (id=?)",
                "CORRELATED SCALAR SUBQUERY 1",
                "SEARCH book USING COVERING INDEX book_by_series (series_local_id=?)",
                "SEARCH book_details USING PRIMARY KEY (book_id=?)",
                "CORRELATED SCALAR SUBQUERY 2",
                "SEARCH book USING COVERING INDEX book_by_series (series_local_id=?)",
                "SEARCH book_details USING PRIMARY KEY (book_id=?)",
            ]
        );
    }

    #[test]
    fn finds_the_people_of_a_series_through_its_books() {
        let scratch = ScratchLibrary::new("series-people-plan");

        let plan = scratch.query_plan(PEOPLE);

        assert_eq!(
            plan,
            [
                "SEARCH series USING COVERING INDEX sqlite_autoindex_series_1 (id=?)",
                "SEARCH book USING COVERING INDEX book_by_series_and_added (series_local_id=?)",
                "SEARCH book_person USING PRIMARY KEY (book_id=?)",
                "USE TEMP B-TREE FOR GROUP BY",
                "USE TEMP B-TREE FOR ORDER BY",
            ]
        );
    }

    #[test]
    fn counts_the_series_naming_a_person_through_the_name_index() {
        let scratch = ScratchLibrary::new("person-series-plan");

        let plan = scratch.query_plan(SERIES_NAMING_PERSON);

        assert_eq!(
            plan,
            [
                "USE TEMP B-TREE FOR count(DISTINCT)",
                "SEARCH book_person USING COVERING INDEX book_person_by_name (name=?)",
                "SEARCH book USING PRIMARY KEY (id=?)",
                "SEARCH series USING INTEGER PRIMARY KEY (rowid=?)",
            ]
        );
    }

    #[test]
    fn finds_the_tags_of_a_series_through_its_books() {
        let scratch = ScratchLibrary::new("series-tags-plan");

        let plan = scratch.query_plan(TAGS);

        assert_eq!(
            plan,
            [
                "SEARCH series USING COVERING INDEX sqlite_autoindex_series_1 (id=?)",
                "SEARCH book USING COVERING INDEX book_by_series_and_added (series_local_id=?)",
                "SEARCH book_tag USING PRIMARY KEY (book_id=?)",
                "USE TEMP B-TREE FOR DISTINCT",
                "USE TEMP B-TREE FOR ORDER BY",
            ]
        );
    }
}
