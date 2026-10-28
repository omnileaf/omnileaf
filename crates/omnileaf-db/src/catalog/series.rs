use std::{
    ffi::OsStr,
    path::{Path, PathBuf},
};

use omnileaf_sync_proto::{KeyError, SeriesId, SourceId, norm};
use rusqlite::{Statement, Transaction};

use crate::{
    Error,
    catalog::{Sourced, ValueSource},
    title_key::TitleCollation,
};

macro_rules! insert_series {
    ($on_conflict:expr) => {
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

macro_rules! trust {
    ($source:expr) => {
        concat!("((", $source, " IS 'files') + (", $source, " IS NOT NULL))")
    };
}

macro_rules! title_is_better {
    () => {
        concat!(
            trust!("excluded.title_source"),
            " > ",
            trust!("series.title_source")
        )
    };
}

macro_rules! year_is_better {
    ($offered:literal, $kept:literal) => {
        concat!(
            "(",
            trust!(concat!($offered, ".year_source")),
            ", -",
            $offered,
            ".year) > (",
            trust!(concat!($kept, ".year_source")),
            ", -",
            $kept,
            ".year)"
        )
    };
}

const ADD_SERIES: &str = insert_series!("");
const ADD_OR_RENAME_SERIES: &str = insert_series!(concat!(
    " ON CONFLICT (id) DO UPDATE SET
        title = iif(",
    title_is_better!(),
    ", excluded.title, series.title),
        title_key = iif(",
    title_is_better!(),
    ", excluded.title_key, series.title_key),
        title_source = iif(",
    title_is_better!(),
    ", excluded.title_source, series.title_source),
        year = iif(",
    year_is_better!("excluded", "series"),
    ", excluded.year, series.year),
        year_source = iif(",
    year_is_better!("excluded", "series"),
    ", excluded.year_source, series.year_source)
    WHERE ",
    title_is_better!(),
    " OR ",
    year_is_better!("excluded", "series"),
    " ON CONFLICT DO NOTHING"
));
const OFFER_YEAR: &str = concat!(
    "UPDATE series SET year = offered.year, year_source = offered.year_source
    FROM series AS offered
    WHERE series.id = ?1 AND offered.id = ?2 AND ",
    year_is_better!("offered", "series")
);
const FOLDER_KEY_SEPARATOR: &str = "/";
const NAMED_KEY_SEPARATOR: &str = "\n";
const SEPARATOR_WITHIN_A_FOLDER_NAME: &str = "\u{ff0f}";

pub(crate) struct SeriesAdder<'t> {
    add: Statement<'t>,
    offer_year: Statement<'t>,
}

#[derive(Clone, Debug)]
pub struct NewSeries {
    id: SeriesId,
    source: SourceId,
    natural_key: String,
    title: String,
    title_source: Option<ValueSource>,
    year: Option<Sourced<u16>>,
    added_at_ms: i64,
    location: Option<PathBuf>,
}

#[derive(Clone, Copy, Debug)]
pub struct SeriesFolder<'a> {
    pub linked_folder: &'a str,
    pub location: &'a Path,
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
            location: None,
        })
    }

    pub fn folder(
        folder: SeriesFolder<'_>,
        naming: SeriesNaming,
        added_at_ms: i64,
    ) -> Result<Self, KeyError> {
        let location: Vec<_> = folder.location.iter().map(OsStr::to_string_lossy).collect();
        Ok(Self {
            id: SeriesId::folder(folder.linked_folder, &location)?,
            source: SourceId::local(),
            natural_key: folder_key(folder.linked_folder, &location),
            title: naming.title.value,
            title_source: Some(naming.title.source),
            year: naming.year,
            added_at_ms,
            location: Some(folder.location.to_path_buf()),
        })
    }

    pub fn named(
        format_family: &str,
        naming: SeriesNaming,
        added_at_ms: i64,
    ) -> Result<Self, KeyError> {
        Ok(Self {
            id: SeriesId::named(format_family, &naming.title.value)?,
            source: SourceId::local(),
            natural_key: format!(
                "{}{NAMED_KEY_SEPARATOR}{}",
                norm(format_family),
                norm(&naming.title.value)
            ),
            title: naming.title.value,
            title_source: Some(naming.title.source),
            year: naming.year,
            added_at_ms,
            location: None,
        })
    }

    #[must_use]
    pub const fn id(&self) -> SeriesId {
        self.id
    }

    pub(crate) fn location(&self) -> Option<&Path> {
        self.location.as_deref()
    }
}

#[tracing::instrument(skip_all, fields(series = %series.id))]
pub fn add_series(transaction: &Transaction<'_>, series: &NewSeries) -> Result<(), Error> {
    let collation = TitleCollation::stored(transaction)?;
    insert(&mut transaction.prepare(ADD_SERIES)?, series, &collation)
}

impl<'t> SeriesAdder<'t> {
    pub(crate) fn new(transaction: &'t Transaction<'_>) -> Result<Self, Error> {
        Ok(Self {
            add: transaction.prepare(ADD_OR_RENAME_SERIES)?,
            offer_year: transaction.prepare(OFFER_YEAR)?,
        })
    }

    pub(crate) fn add_or_rename(
        &mut self,
        series: &NewSeries,
        collation: &TitleCollation,
    ) -> Result<(), Error> {
        insert(&mut self.add, series, collation)
    }

    pub(crate) fn offer_year_of(&mut self, offered: SeriesId, to: SeriesId) -> Result<(), Error> {
        self.offer_year
            .execute((to.as_bytes(), offered.as_bytes()))?;
        Ok(())
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

fn folder_key<P: AsRef<str>>(linked_folder: &str, location: &[P]) -> String {
    let location: Vec<_> = location
        .iter()
        .map(|folder| folder_key_part(folder.as_ref()))
        .collect();
    format!(
        "{}{FOLDER_KEY_SEPARATOR}{}",
        folder_key_part(linked_folder),
        location.join(FOLDER_KEY_SEPARATOR)
    )
}

fn folder_key_part(folder: &str) -> String {
    norm(folder).replace(FOLDER_KEY_SEPARATOR, SEPARATOR_WITHIN_A_FOLDER_NAME)
}
