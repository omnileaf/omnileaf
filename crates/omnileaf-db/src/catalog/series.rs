use omnileaf_sync_proto::{KeyError, SeriesId, SourceId, norm};
use rusqlite::{Statement, Transaction};

use crate::{
    Error,
    catalog::{Sourced, ValueSource},
    title_key::TitleCollation,
};

macro_rules! insert_series {
    ($on_conflict:literal) => {
        concat!(
            "INSERT INTO series (
                id, source_id, natural_key, title, title_key, added_at_ms, title_source, year,
                year_source
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            $on_conflict
        )
    };
}

const ADD_SERIES: &str = insert_series!("");
const ADD_SERIES_UNLESS_PRESENT: &str = insert_series!(" ON CONFLICT DO NOTHING");
const FOLDER_KEY_SEPARATOR: char = '/';

pub(crate) struct SeriesAdder<'t>(Statement<'t>);

#[derive(Clone, Debug)]
pub struct NewSeries {
    id: SeriesId,
    source: SourceId,
    natural_key: String,
    title: String,
    title_source: Option<ValueSource>,
    year: Option<Sourced<u16>>,
    added_at_ms: i64,
}

#[derive(Clone, Copy, Debug)]
pub struct SeriesFolder<'a> {
    pub linked_folder: &'a str,
    pub location: &'a str,
}

#[derive(Clone, Debug)]
pub struct SeriesNaming {
    pub title: Sourced<String>,
    pub year: Option<Sourced<u16>>,
}

impl NewSeries {
    pub fn local(folder_name: &str, added_at_ms: i64) -> Result<Self, KeyError> {
        Ok(Self {
            id: SeriesId::local(folder_name)?,
            source: SourceId::local(),
            natural_key: norm(folder_name),
            title: folder_name.to_owned(),
            title_source: None,
            year: None,
            added_at_ms,
        })
    }

    pub fn folder(
        folder: SeriesFolder<'_>,
        naming: SeriesNaming,
        added_at_ms: i64,
    ) -> Result<Self, KeyError> {
        Ok(Self {
            id: SeriesId::folder(folder.linked_folder, &[folder.location])?,
            source: SourceId::local(),
            natural_key: format!(
                "{}{FOLDER_KEY_SEPARATOR}{}",
                norm(folder.linked_folder),
                norm(folder.location)
            ),
            title: naming.title.value,
            title_source: Some(naming.title.source),
            year: naming.year,
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
    let collation = TitleCollation::stored(transaction)?;
    insert(&mut transaction.prepare(ADD_SERIES)?, series, &collation)
}

impl<'t> SeriesAdder<'t> {
    pub(crate) fn new(transaction: &'t Transaction<'_>) -> Result<Self, Error> {
        Ok(Self(transaction.prepare(ADD_SERIES_UNLESS_PRESENT)?))
    }

    pub(crate) fn add_unless_present(
        &mut self,
        series: &NewSeries,
        collation: &TitleCollation,
    ) -> Result<(), Error> {
        insert(&mut self.0, series, collation)
    }
}

fn insert(
    statement: &mut Statement<'_>,
    series: &NewSeries,
    collation: &TitleCollation,
) -> Result<(), Error> {
    statement.execute((
        series.id.as_bytes(),
        series.source.as_bytes(),
        &series.natural_key,
        &series.title,
        collation.key(&series.title),
        series.added_at_ms,
        series.title_source.map(ValueSource::as_stored),
        series.year.map(|year| year.value),
        series.year.map(|year| year.source.as_stored()),
    ))?;
    Ok(())
}
