use omnileaf_sync_proto::SeriesId;
use rusqlite::{Connection, OptionalExtension, Row, types::FromSql};

use crate::{
    Error,
    catalog::{
        Cover, Numbering, RootLocator, Sourced, ValueSource, cover::stored_cover,
        numbering::stored_numbering, root::stored_locator, stored_id::stored_id,
    },
};

const OVERVIEW_OF_SERIES: &str = concat!(
    "SELECT library_root.locator_kind, library_root.location, library_root.bookmark,
        library_root.tree_name, library_root.tree_place,
        series.id AS id, series.title, series.file_title, series.title_source, series.year, series.year_source,
        series.language, series.language_source, series.book_count, series.read_count,
        series.pages_left, series.uncounted_books, series.adult_rated_books - series.marked_adult > 0 AS is_rated_adult,
        series.marked_adult = 1 AS is_marked_adult,
        (SELECT count(*) FROM book WHERE book.series_local_id = series.local_id
            AND EXISTS (SELECT 1 FROM book_bookmark WHERE book_bookmark.book_id = book.id))
            AS bookmark_count,
        cover.book_id AS cover_book, cover.id AS cover_file, cover.rev AS cover_rev
    FROM series ",
    crate::catalog::cover::join_series_cover!(),
    " LEFT JOIN library_root ON library_root.id = cover.root_id
    WHERE series.id = ?1 AND series.book_count > 0"
);
const NUMBERING_OF_PLACED_BOOKS: &str = "SELECT kind, first_number, last_number, number_source,
        volume_number, volume_source
    FROM book
    WHERE series_local_id = (SELECT local_id FROM series WHERE id = ?1) AND kind IS NOT NULL
    ORDER BY reading_order_key, id";
const ROOT_LOCATOR_KIND_COLUMN: usize = 0;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SeriesOverview {
    pub id: SeriesId,
    pub title: String,
    pub file_title: String,
    /// Absent for a series keyed by name alone, which its next rescan files by folder.
    pub title_source: Option<ValueSource>,
    pub year: Option<Sourced<u16>>,
    pub language: Option<Sourced<String>>,
    pub book_count: u32,
    pub read_count: u32,
    /// The cover the library shows for the series, absent while none of its books has a file.
    pub cover: Option<Cover>,
    pub folder: Option<RootLocator>,
    /// Absent while a book not marked read has no page count.
    pub pages_left: Option<u32>,
    pub is_rated_adult: bool,
    pub is_marked_adult: bool,
    /// The books with a bookmarked page.
    pub bookmark_count: u32,
}

/// None for a series missing from the catalog or holding no books, which the library doesn't show.
#[tracing::instrument(skip_all, fields(%series))]
pub fn series_overview(
    connection: &Connection,
    series: SeriesId,
) -> Result<Option<SeriesOverview>, Error> {
    Ok(connection
        .prepare(OVERVIEW_OF_SERIES)?
        .query_row([series.as_bytes()], overview)
        .optional()?)
}

/// The numbering of each of a series' books placed by number, in reading order, leaving out books not placed yet.
#[tracing::instrument(skip_all, fields(%series))]
pub fn series_numberings(
    connection: &Connection,
    series: SeriesId,
) -> Result<Vec<Numbering>, Error> {
    let mut statement = connection.prepare(NUMBERING_OF_PLACED_BOOKS)?;
    let placed = statement
        .query_map([series.as_bytes()], stored_numbering)?
        .filter_map(Result::transpose)
        .collect::<rusqlite::Result<_>>()?;
    Ok(placed)
}

fn overview(row: &Row<'_>) -> rusqlite::Result<SeriesOverview> {
    let cover = stored_cover(row)?;
    let folder = cover
        .map(|_| stored_locator(row, ROOT_LOCATOR_KIND_COLUMN))
        .transpose()?;
    Ok(SeriesOverview {
        id: stored_id(row, "id")?,
        title: row.get("title")?,
        file_title: row.get("file_title")?,
        title_source: row.get("title_source")?,
        year: sourced(row, "year", "year_source")?,
        language: sourced(row, "language", "language_source")?,
        book_count: row.get("book_count")?,
        read_count: row.get("read_count")?,
        cover,
        folder,
        pages_left: counted_pages_left(row)?,
        is_rated_adult: row.get("is_rated_adult")?,
        is_marked_adult: row.get("is_marked_adult")?,
        bookmark_count: row.get("bookmark_count")?,
    })
}

fn sourced<T: FromSql>(
    row: &Row<'_>,
    value: &str,
    source: &str,
) -> rusqlite::Result<Option<Sourced<T>>> {
    let value: Option<T> = row.get(value)?;
    let source: Option<ValueSource> = row.get(source)?;
    Ok(value
        .zip(source)
        .map(|(value, source)| Sourced { value, source }))
}

fn counted_pages_left(row: &Row<'_>) -> rusqlite::Result<Option<u32>> {
    let uncounted_books: u32 = row.get("uncounted_books")?;
    if uncounted_books > 0 {
        return Ok(None);
    }
    row.get("pages_left").map(Some)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{catalog::staged_rows::plans::with_covers, scratch::ScratchLibrary};

    #[test]
    fn finds_a_series_its_cover_and_that_file_s_folder_by_their_keys() {
        let scratch = ScratchLibrary::new("series-overview-plan");

        let plan = scratch.query_plan(OVERVIEW_OF_SERIES);

        let mut expected = with_covers(
            vec!["SEARCH series USING INDEX sqlite_autoindex_series_1 (id=?)".to_owned()],
            (5, 3),
        );
        expected.extend(
            [
                "SEARCH library_root USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN",
                "CORRELATED SCALAR SUBQUERY 2",
                "SEARCH book USING COVERING INDEX book_by_series_and_added (series_local_id=?)",
                "SEARCH book_bookmark EXISTS USING PRIMARY KEY (book_id=?)",
            ]
            .map(ToOwned::to_owned),
        );
        assert_eq!(plan, expected);
    }

    #[test]
    fn reads_the_numbering_of_a_series_books_in_reading_order_by_index_without_sorting() {
        let scratch = ScratchLibrary::new("series-numberings-plan");

        let plan = scratch.query_plan(NUMBERING_OF_PLACED_BOOKS);

        assert_eq!(
            plan,
            [
                "SEARCH book USING INDEX book_by_series (series_local_id=?)",
                "SCALAR SUBQUERY 1",
                "SEARCH series USING COVERING INDEX sqlite_autoindex_series_1 (id=?)",
            ]
        );
    }
}
