use std::{
    ffi::OsStr,
    path::{Path, PathBuf},
};

use omnileaf_sync_proto::{KeyError, SeriesId, SourceId, norm};
use rusqlite::{Connection, OptionalExtension, Statement, Transaction};

use crate::{
    Error,
    catalog::{Sourced, ValueSource},
    title_key::TitleCollation,
};

macro_rules! insert_series {
    ($on_conflict:expr) => {
        concat!(
            "INSERT INTO series (
                id, source_id, natural_key, file_title, file_title_key, added_at_ms, title_source,
                year, year_source, title, title_key
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
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

const ADD_SERIES: &str = insert_series!("");
const ADD_OR_RENAME_SERIES: &str = insert_series!(concat!(
    " ON CONFLICT (id) DO UPDATE SET
        file_title = excluded.file_title,
        file_title_key = excluded.file_title_key,
        title = coalesce(
            (SELECT edited.title FROM series_edit AS edited WHERE edited.series_id = series.id),
            excluded.file_title
        ),
        title_key = CASE WHEN EXISTS (
            SELECT 1 FROM series_edit AS edited
            WHERE edited.series_id = series.id AND edited.title IS NOT NULL
        ) THEN series.title_key ELSE excluded.file_title_key END,
        title_source = excluded.title_source
    WHERE ",
    title_is_better!(),
    " ON CONFLICT DO NOTHING"
));
const FOLDER_KEY_SEPARATOR: &str = "/";
const NAMED_KEY_SEPARATOR: &str = "\n";
const SEPARATOR_WITHIN_A_FOLDER_NAME: &str = "\u{ff0f}";

pub(crate) struct SeriesAdder<'t> {
    transaction: &'t Transaction<'t>,
    add: Statement<'t>,
}

#[derive(Clone, Debug)]
pub struct NewSeries {
    id: SeriesId,
    source: SourceId,
    natural_key: String,
    title: String,
    added_at_ms: i64,
    pub(crate) key: SeriesKey,
}

#[derive(Clone, Debug)]
pub(crate) enum SeriesKey {
    Local,
    Folder {
        location: PathBuf,
        title_source: ValueSource,
        year: Option<Sourced<u16>>,
    },
    Named,
}

#[derive(Clone, Debug)]
pub struct NamedSeries(NewSeries);

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
            added_at_ms,
            key: SeriesKey::Local,
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
            added_at_ms,
            key: SeriesKey::Folder {
                location: folder.location.to_path_buf(),
                title_source: naming.title.source,
                year: naming.year,
            },
        })
    }

    #[must_use]
    pub const fn id(&self) -> SeriesId {
        self.id
    }

    const fn title_source(&self) -> Option<ValueSource> {
        match self.key {
            SeriesKey::Local => None,
            SeriesKey::Folder { title_source, .. } => Some(title_source),
            SeriesKey::Named => Some(ValueSource::Files),
        }
    }

    const fn year(&self) -> Option<Sourced<u16>> {
        match self.key {
            SeriesKey::Folder { year, .. } => year,
            SeriesKey::Local | SeriesKey::Named => None,
        }
    }
}

impl NamedSeries {
    pub fn new(format_family: &str, title: &str, added_at_ms: i64) -> Result<Self, KeyError> {
        Ok(Self(NewSeries {
            id: SeriesId::named(format_family, title)?,
            source: SourceId::local(),
            natural_key: format!(
                "{}{NAMED_KEY_SEPARATOR}{}",
                norm(format_family),
                norm(title)
            ),
            title: title.to_owned(),
            added_at_ms,
            key: SeriesKey::Named,
        }))
    }

    #[must_use]
    pub const fn id(&self) -> SeriesId {
        self.0.id
    }

    pub(crate) const fn as_series(&self) -> &NewSeries {
        &self.0
    }
}

#[tracing::instrument(skip_all, fields(series = %series.id))]
pub fn add_series(transaction: &Transaction<'_>, series: &NewSeries) -> Result<(), Error> {
    let collation = TitleCollation::stored(transaction)?;
    insert(
        transaction,
        &mut transaction.prepare(ADD_SERIES)?,
        series,
        &collation,
    )
}

impl<'t> SeriesAdder<'t> {
    pub(crate) fn new(transaction: &'t Transaction<'_>) -> Result<Self, Error> {
        Ok(Self {
            transaction,
            add: transaction.prepare(ADD_OR_RENAME_SERIES)?,
        })
    }

    pub(crate) fn add_or_rename(
        &mut self,
        series: &NewSeries,
        collation: &TitleCollation,
    ) -> Result<(), Error> {
        insert(self.transaction, &mut self.add, series, collation)
    }
}

fn insert(
    connection: &Connection,
    statement: &mut Statement<'_>,
    series: &NewSeries,
    collation: &TitleCollation,
) -> Result<(), Error> {
    let edited_title = edited_title(connection, series)?;
    let shown_title = edited_title.as_deref().unwrap_or(&series.title);
    statement.execute((
        series.id.as_bytes(),
        series.source.as_bytes(),
        &series.natural_key,
        &series.title,
        collation.key(&series.title),
        series.added_at_ms,
        series.title_source().map(ValueSource::as_stored),
        series.year().map(|year| year.value),
        series.year().map(|year| year.source.as_stored()),
        shown_title,
        collation.key(shown_title),
    ))?;
    Ok(())
}

fn edited_title(connection: &Connection, series: &NewSeries) -> Result<Option<String>, Error> {
    Ok(connection
        .prepare("SELECT title FROM series_edit WHERE series_id = ?1")?
        .query_row([series.id.as_bytes()], |row| row.get(0))
        .optional()?
        .flatten())
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

#[cfg(test)]
mod tests {
    use crate::scratch::ScratchLibrary;

    #[test]
    fn dates_a_series_through_the_indexes_of_its_books_and_folders() {
        let scratch = ScratchLibrary::new("date-series-plan");

        let plan = scratch
            .query_plan("SELECT year, year_source FROM series_year WHERE series_local_id = ?1");

        let books_in_series = [
            "CORRELATED SCALAR SUBQUERY 4",
            "SEARCH book USING COVERING INDEX book_by_series_and_added (series_local_id=?)",
            "SEARCH book_details USING PRIMARY KEY (book_id=?)",
        ];
        let folders_of_series = [
            "CORRELATED SCALAR SUBQUERY 5",
            "SEARCH series_folder USING INDEX series_folder_by_series (series_local_id=?)",
        ];
        assert_eq!(
            plan,
            [
                ["SEARCH series USING INTEGER PRIMARY KEY (rowid=?)"].as_slice(),
                &books_in_series,
                &folders_of_series,
                &books_in_series,
                &folders_of_series,
            ]
            .concat()
        );
    }

    #[test]
    fn names_a_series_through_the_reading_order_index_of_its_books() {
        let scratch = ScratchLibrary::new("name-series-plan");

        let plan = scratch.query_plan(
            "SELECT language, language_source FROM series_language WHERE series_local_id = ?1",
        );

        assert_eq!(
            plan,
            [
                "SEARCH series USING INTEGER PRIMARY KEY (rowid=?)",
                "SEARCH book USING PRIMARY KEY (id=?) LEFT-JOIN",
                "CORRELATED SCALAR SUBQUERY 3",
                "SEARCH named USING INDEX book_by_series (series_local_id=?)",
                "SEARCH named_details USING PRIMARY KEY (book_id=?) LEFT-JOIN",
                "SEARCH book_details USING PRIMARY KEY (book_id=?) LEFT-JOIN",
            ]
        );
    }
}
