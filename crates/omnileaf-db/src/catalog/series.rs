use omnileaf_sync_proto::{KeyError, SeriesId, SourceId, norm};
use rusqlite::Transaction;

use crate::{
    Error,
    title_key::{TitleCollation, stored_language},
};

const ADD_SERIES: &str =
    "INSERT INTO series (id, source_id, natural_key, title, title_key, added_at_ms)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)";
const ADD_SERIES_UNLESS_PRESENT: &str =
    "INSERT INTO series (id, source_id, natural_key, title, title_key, added_at_ms)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT DO NOTHING";

#[derive(Clone, Debug)]
pub struct NewSeries {
    id: SeriesId,
    source: SourceId,
    natural_key: String,
    title: String,
    added_at_ms: i64,
}

impl NewSeries {
    /// A series of the local library, titled and identified by its folder's name.
    pub fn local(folder_name: &str, added_at_ms: i64) -> Result<Self, KeyError> {
        Ok(Self {
            id: SeriesId::local(folder_name)?,
            source: SourceId::local(),
            natural_key: norm(folder_name),
            title: folder_name.to_owned(),
            added_at_ms,
        })
    }

    #[must_use]
    pub const fn id(&self) -> SeriesId {
        self.id
    }
}

#[tracing::instrument(skip_all, fields(series = %series.id))]
pub fn add_series(transaction: &Transaction<'_>, series: &NewSeries) -> Result<(), Error> {
    insert(transaction, series, ADD_SERIES)
}

/// Leaves a series already in the catalog as it is, title included.
pub(crate) fn add_series_unless_present(
    transaction: &Transaction<'_>,
    series: &NewSeries,
) -> Result<(), Error> {
    insert(transaction, series, ADD_SERIES_UNLESS_PRESENT)
}

fn insert(transaction: &Transaction<'_>, series: &NewSeries, sql: &str) -> Result<(), Error> {
    let collation = TitleCollation::new(&stored_language(transaction)?)?;
    transaction.prepare(sql)?.execute((
        series.id.as_bytes(),
        series.source.as_bytes(),
        &series.natural_key,
        &series.title,
        collation.key(&series.title),
        series.added_at_ms,
    ))?;
    Ok(())
}
