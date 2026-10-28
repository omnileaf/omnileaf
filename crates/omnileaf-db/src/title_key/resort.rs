use rusqlite::Connection;

use crate::{
    Error,
    catalog::folder_groups::rekey_every_folder_group,
    title_key::{
        Language, TitleCollation,
        stamp::{TitleStamp, save_stamp, stored_language, stored_stamp},
    },
};

const PERSON_NAMES: &str = "SELECT DISTINCT name FROM book_person";
const REKEY_PERSON_NAME: &str =
    "UPDATE book_person SET name_key = ?2 WHERE name = ?1 AND name_key IS NOT ?2";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Resorted {
    Unchanged,
    Rekeyed,
}

#[tracing::instrument(skip_all, fields(%language))]
pub(crate) fn sort_titles_for(
    connection: &Connection,
    language: &Language,
) -> Result<Resorted, Error> {
    let stamp = TitleStamp::of(language);
    if stored_stamp(connection)? == stamp {
        return Ok(Resorted::Unchanged);
    }
    let collation = TitleCollation::new(language)?;
    let titles = rekey_every_title(connection, &collation)?;
    let names = rekey_every_person_name(connection, &collation)?;
    let folder_groups = rekey_every_folder_group(connection, &collation)?;
    save_stamp(connection, language, stamp)?;
    tracing::info!(
        titles,
        names,
        folder_groups,
        "keyed the series titles, people's names and folder groups again"
    );
    Ok(Resorted::Rekeyed)
}

pub(crate) fn keep_titles_sorted(connection: &Connection) -> Result<Resorted, Error> {
    sort_titles_for(connection, &stored_language(connection)?)
}

fn rekey_every_title(connection: &Connection, collation: &TitleCollation) -> Result<usize, Error> {
    let titles = connection
        .prepare("SELECT local_id, title, file_title FROM series")?
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let mut rekey = connection.prepare(
        "UPDATE series SET title_key = ?2, file_title_key = ?3
        WHERE local_id = ?1 AND (title_key, file_title_key) IS NOT (?2, ?3)",
    )?;
    for (local_id, title, file_title) in &titles {
        rekey.execute((local_id, collation.key(title), collation.key(file_title)))?;
    }
    Ok(titles.len())
}

fn rekey_every_person_name(
    connection: &Connection,
    collation: &TitleCollation,
) -> Result<usize, Error> {
    let names = connection
        .prepare(PERSON_NAMES)?
        .query_map([], |row| row.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    let mut rekey = connection.prepare(REKEY_PERSON_NAME)?;
    for name in &names {
        rekey.execute((name, collation.key(name)))?;
    }
    Ok(names.len())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scratch::ScratchLibrary;

    #[test]
    fn reads_each_person_s_name_once_from_the_name_index() {
        let scratch = ScratchLibrary::new("person-names-plan");

        let plan = scratch.query_plan(PERSON_NAMES);

        assert_eq!(
            plan,
            ["SCAN book_person USING COVERING INDEX book_person_by_name"]
        );
    }

    #[test]
    fn keys_a_person_s_rows_again_through_the_name_index() {
        let scratch = ScratchLibrary::new("rekey-person-name-plan");

        let plan = scratch.query_plan(REKEY_PERSON_NAME);

        assert_eq!(
            plan,
            ["SEARCH book_person USING INDEX book_person_by_name (name=?)"]
        );
    }
}
