use omnileaf_sync_proto::SeriesId;
use rusqlite::{Connection, Row};

use crate::{
    Error,
    catalog::{Cover, PersonRole, cover::stored_cover, stored_id::stored_id},
};

const SERIES_NAMING_PERSON: &str = concat!(
    "WITH named AS (
        SELECT DISTINCT book.series_local_id, book_person.role FROM book_person
        JOIN book ON book.id = book_person.book_id
        WHERE book_person.name = ?1
    )
    SELECT series.id AS id, series.title, named.role,
        cover.book_id AS cover_book, cover.id AS cover_file, cover.rev AS cover_rev
    FROM named
    JOIN series ON series.local_id = named.series_local_id ",
    crate::catalog::cover::join_series_cover!(),
    " WHERE series.reading_stage IS NOT NULL
    ORDER BY series.title_key, series.id, named.role"
);

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PersonSeries {
    pub id: SeriesId,
    pub title: String,
    pub cover: Option<Cover>,
    pub roles: Vec<PersonRole>,
}

#[tracing::instrument(skip_all)]
pub fn person_series(connection: &Connection, person: &str) -> Result<Vec<PersonSeries>, Error> {
    let rows: Vec<(PersonSeries, String)> = connection
        .prepare(SERIES_NAMING_PERSON)?
        .query_map([person], named_series)?
        .collect::<Result<_, _>>()?;
    let mut found: Vec<PersonSeries> = Vec::new();
    for (series, role) in rows {
        let role = PersonRole::stored(role)?;
        match found.last_mut() {
            Some(last) if last.id == series.id => last.roles.push(role),
            _ => found.push(PersonSeries {
                roles: vec![role],
                ..series
            }),
        }
    }
    Ok(found)
}

fn named_series(row: &Row<'_>) -> rusqlite::Result<(PersonSeries, String)> {
    let series = PersonSeries {
        id: stored_id(row, "id")?,
        title: row.get("title")?,
        cover: stored_cover(row)?,
        roles: Vec::new(),
    };
    Ok((series, row.get("role")?))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{catalog::staged_rows::plans::with_covers, scratch::ScratchLibrary};

    #[test]
    fn finds_the_series_naming_a_person_through_the_name_index() {
        let scratch = ScratchLibrary::new("person-series-plan");

        let plan = scratch.query_plan(SERIES_NAMING_PERSON);

        let named = [
            "CO-ROUTINE named",
            "SEARCH book_person USING COVERING INDEX book_person_by_name (name=?)",
            "SEARCH book USING PRIMARY KEY (id=?)",
            "USE TEMP B-TREE FOR DISTINCT",
            "SCAN named",
            "SEARCH series USING INTEGER PRIMARY KEY (rowid=?)",
        ]
        .map(str::to_owned)
        .to_vec();
        let mut expected = with_covers(named, (4, 2));
        expected.push("USE TEMP B-TREE FOR ORDER BY".to_owned());
        assert_eq!(plan, expected);
    }
}
