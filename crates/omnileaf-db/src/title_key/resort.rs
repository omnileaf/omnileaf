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

/// Keys every series title again for `language` within the caller's transaction, unless the stored keys carry this build's stamp for it.
#[tracing::instrument(skip_all, fields(%language))]
pub(crate) fn sort_titles_for(
    connection: &Connection,
    language: &Language,
) -> Result<Resorted, Error> {
    let stamp = TitleStamp::of(language);
    if stored_stamp(connection)? == stamp {
        return Ok(Resorted::Unchanged);
    }
    let titles = rekey_every_title(connection, &TitleCollation::new(language)?)?;
    save_stamp(connection, language, stamp)?;
    tracing::info!(titles, "keyed the series titles again");
    Ok(Resorted::Rekeyed)
}

/// Keys the titles again for the language they were last sorted for, when they were keyed by other rules or another ICU4X build.
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
