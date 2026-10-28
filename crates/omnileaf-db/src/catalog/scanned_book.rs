use std::path::PathBuf;

use omnileaf_sync_proto::{Fingerprint, SeriesId};
use rusqlite::{Statement, Transaction};

use crate::{
    Error,
    catalog::{
        BookDetails, NamedSeries, NewBook, NewSeries, Numbering, RootId,
        book::{BookFiler, Filing},
        book_details::DetailsRecorder,
        folder_joins::{FolderJoins, FoundIn},
        native_path,
        series::SeriesAdder,
        stored_id::stored_id,
    },
    title_key::TitleCollation,
};

const RECORD_FILE: &str =
    "INSERT INTO book_file (book_id, root_id, location, size_bytes, modified_at_ms)
     VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT (root_id, location) DO UPDATE SET
         book_id = excluded.book_id,
         size_bytes = excluded.size_bytes,
         modified_at_ms = excluded.modified_at_ms,
         rev = rev + 1
     WHERE book_id != excluded.book_id
         OR size_bytes != excluded.size_bytes
         OR modified_at_ms != excluded.modified_at_ms";

const SERIES_OF_BOOK: &str = "SELECT series.id
     FROM book JOIN series ON series.local_id = book.series_local_id
     WHERE book.id = ?1";

#[derive(Clone, Debug)]
pub struct ScannedBook {
    pub series: NewSeries,
    pub named_series: Option<NamedSeries>,
    pub fingerprint: Fingerprint,
    pub title: String,
    pub added_at_ms: i64,
    pub page_count: u32,
    pub details: BookDetails,
    pub file: BookFile,
    pub numbering: Option<Numbering>,
}

#[derive(Clone, Debug)]
pub struct BookFile {
    pub root: RootId,
    pub location: PathBuf,
    pub size_bytes: u64,
    pub modified_at_ms: i64,
}

#[tracing::instrument(skip_all, fields(books = scanned.len()))]
pub fn record_scanned_books(
    transaction: &Transaction<'_>,
    scanned: &[ScannedBook],
) -> Result<Vec<SeriesId>, Error> {
    record(transaction, scanned, Filing::FollowingItsOnlyFile)
}

#[tracing::instrument(skip_all, fields(books = moved.len()))]
pub fn record_moved_books(
    transaction: &Transaction<'_>,
    moved: &[ScannedBook],
) -> Result<Vec<SeriesId>, Error> {
    record(transaction, moved, Filing::WhereFoundNow)
}

struct Recorder<'t> {
    collation: TitleCollation,
    series: SeriesAdder<'t>,
    folders: FolderJoins<'t>,
    books: BookFiler<'t>,
    details: DetailsRecorder<'t>,
    file: Statement<'t>,
    series_of_book: Statement<'t>,
}

fn record(
    transaction: &Transaction<'_>,
    scanned: &[ScannedBook],
    filing: Filing,
) -> Result<Vec<SeriesId>, Error> {
    let mut recorder = Recorder::new(transaction, filing)?;
    scanned.iter().map(|book| recorder.record(book)).collect()
}

impl<'t> Recorder<'t> {
    fn new(transaction: &'t Transaction<'_>, filing: Filing) -> Result<Self, Error> {
        Ok(Self {
            collation: TitleCollation::stored(transaction)?,
            series: SeriesAdder::new(transaction)?,
            folders: FolderJoins::new(transaction)?,
            books: BookFiler::new(transaction, filing)?,
            details: DetailsRecorder::new(transaction)?,
            file: transaction.prepare(RECORD_FILE)?,
            series_of_book: transaction.prepare(SERIES_OF_BOOK)?,
        })
    }

    fn record(&mut self, scanned: &ScannedBook) -> Result<SeriesId, Error> {
        self.series
            .add_or_rename(&scanned.series, &self.collation)?;
        let found_in = FoundIn {
            root: scanned.file.root,
            series: &scanned.series,
            named_series: scanned.named_series.as_ref(),
        };
        let series =
            self.folders
                .series_to_file_in(&found_in, &mut self.series, &self.collation)?;
        let book = NewBook {
            fingerprint: scanned.fingerprint,
            series,
            title: scanned.title.clone(),
            added_at_ms: scanned.added_at_ms,
            page_count: Some(scanned.page_count),
            numbering: scanned.numbering,
        };
        self.books.file(&book, &scanned.file)?;
        self.books
            .record_page_count(book.id(), scanned.page_count)?;
        self.details
            .record(book.id(), &scanned.details, &self.collation)?;
        let file = &scanned.file;
        self.file.execute((
            book.id().as_bytes(),
            file.root.0,
            native_path::to_bytes(&file.location),
            i64::try_from(file.size_bytes).unwrap_or(i64::MAX),
            file.modified_at_ms,
        ))?;
        Ok(self
            .series_of_book
            .query_row([book.id().as_bytes()], |row| stored_id(row, "id"))?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scratch::ScratchLibrary;

    #[test]
    fn finds_the_series_of_a_book_by_their_keys() {
        let scratch = ScratchLibrary::new("series-of-book-plan");

        let plan = scratch.query_plan(SERIES_OF_BOOK);

        assert_eq!(
            plan,
            [
                "SEARCH book USING PRIMARY KEY (id=?)",
                "SEARCH series USING INTEGER PRIMARY KEY (rowid=?)",
            ]
        );
    }
}
