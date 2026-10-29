use omnileaf_sync_proto::SeriesId;
use rusqlite::{Connection, Row, ToSql};

use crate::{
    Error,
    adult_content::AdultHiding,
    catalog::{Cover, PersonRole, cover::stored_cover, stored_id::stored_id},
};

const SERIES_NAMING_PERSON: &str = concat!(
    "WITH named AS (
        SELECT series_local_id, role FROM series_person WHERE name = :person
    )
    SELECT series.id AS id, series.title, named.role,
        cover.book_id AS cover_book, cover.id AS cover_file, cover.rev AS cover_rev
    FROM named
    JOIN series ON series.local_id = named.series_local_id ",
    crate::catalog::cover::join_series_cover!(),
    " WHERE series.reading_stage IS NOT NULL AND NOT ",
    crate::adult_content::in_hidden_adult_series!("series"),
    "
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
pub fn person_series(
    connection: &Connection,
    person: &str,
    hiding: AdultHiding,
) -> Result<Vec<PersonSeries>, Error> {
    let [leaves_out, counts] = hiding.params();
    let rows: Vec<(PersonSeries, String)> = connection
        .prepare(SERIES_NAMING_PERSON)?
        .query_map(
            &[(":person", &person as &dyn ToSql), leaves_out, counts][..],
            named_series,
        )?
        .collect::<Result<_, _>>()?;
    let mut found: Vec<PersonSeries> = Vec::new();
    for (series, role) in rows {
        let role = if role.is_empty() {
            None
        } else {
            Some(PersonRole::stored(role)?)
        };
        match found.last_mut() {
            Some(last) if last.id == series.id => last.roles.extend(role),
            _ => found.push(PersonSeries {
                roles: role.into_iter().collect(),
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
            "SEARCH series_person USING COVERING INDEX series_person_by_name (name=?)",
            "SEARCH series USING INTEGER PRIMARY KEY (rowid=?)",
        ]
        .map(str::to_owned)
        .to_vec();
        let mut expected = with_covers(named);
        expected.push("USE TEMP B-TREE FOR ORDER BY".to_owned());
        assert_eq!(plan, expected);
    }
}
