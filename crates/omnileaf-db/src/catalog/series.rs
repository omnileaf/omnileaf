use omnileaf_sync_proto::{KeyError, SeriesId, norm};
use rusqlite::Transaction;

use crate::{Error, title_sort::title_sort_key};

const LOCAL_SOURCE: &str = "local";

#[derive(Clone, Debug)]
pub struct NewSeries {
    id: SeriesId,
    natural_key: String,
    title: String,
    added_at_ms: i64,
}

impl NewSeries {
    /// A series of the local library, titled and identified by its folder's name.
    pub fn local(folder_name: &str, added_at_ms: i64) -> Result<Self, KeyError> {
        Ok(Self {
            id: SeriesId::local(folder_name)?,
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
    transaction
        .prepare(
            "INSERT INTO series (id, source_id, natural_key, title, title_sort_key, added_at_ms)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        )?
        .execute((
            series.id.as_bytes(),
            LOCAL_SOURCE,
            &series.natural_key,
            &series.title,
            title_sort_key(&series.title),
            series.added_at_ms,
        ))?;
    Ok(())
}
