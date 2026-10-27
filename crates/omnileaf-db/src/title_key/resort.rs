use rusqlite::Connection;

use crate::{
    Error,
    title_key::{
        Language, TitleCollation,
        stamp::{TitleStamp, save_stamp, stored_language, stored_stamp},
    },
};

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
    save_stamp(connection, language, stamp)?;
    tracing::info!(
        titles,
        names,
        "keyed the series titles and people's names again"
    );
    Ok(Resorted::Rekeyed)
}

pub(crate) fn keep_titles_sorted(connection: &Connection) -> Result<Resorted, Error> {
    sort_titles_for(connection, &stored_language(connection)?)
}

fn rekey_every_title(connection: &Connection, collation: &TitleCollation) -> Result<usize, Error> {
    let titles = connection
        .prepare("SELECT local_id, title FROM series")?
        .query_map([], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let mut rekey = connection
        .prepare("UPDATE series SET title_key = ?2 WHERE local_id = ?1 AND title_key IS NOT ?2")?;
    for (local_id, title) in &titles {
        rekey.execute((local_id, collation.key(title)))?;
    }
    Ok(titles.len())
}

fn rekey_every_person_name(
    connection: &Connection,
    collation: &TitleCollation,
) -> Result<usize, Error> {
    let names = connection
        .prepare("SELECT DISTINCT name FROM book_person")?
        .query_map([], |row| row.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    let mut rekey = connection
        .prepare("UPDATE book_person SET name_key = ?2 WHERE name = ?1 AND name_key IS NOT ?2")?;
    for name in &names {
        rekey.execute((name, collation.key(name)))?;
    }
    Ok(names.len())
}
