use omnileaf_sync_proto::SeriesId;
use rusqlite::{Connection, OptionalExtension, Row};

use crate::{
    Error,
    catalog::{
        Cover, RootLocator, cover::stored_cover, root::stored_locator, stored_id::stored_id,
    },
};

const OVERVIEW_OF_SERIES: &str = concat!(
    "SELECT library_root.locator_kind, library_root.location, library_root.bookmark,
        library_root.tree_name, library_root.tree_place,
        series.id AS id, series.title, series.book_count, series.read_count,
        series.pages_left, series.uncounted_books, series.adult_rated_books > 0 AS is_rated_adult,
        cover.book_id AS cover_book, cover.id AS cover_file, cover.rev AS cover_rev
    FROM series ",
    crate::catalog::cover::join_series_cover!(),
    " LEFT JOIN library_root ON library_root.id = cover.root_id
    WHERE series.id = ?1 AND series.book_count > 0"
);
const ROOT_LOCATOR_KIND_COLUMN: usize = 0;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SeriesOverview {
    pub id: SeriesId,
    pub title: String,
    pub book_count: u32,
    pub read_count: u32,
    /// The cover the library shows for the series, absent while none of its books has a file.
    pub cover: Option<Cover>,
    pub folder: Option<RootLocator>,
    /// Absent while a book not marked read has no page count.
    pub pages_left: Option<u32>,
    pub is_rated_adult: bool,
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

fn overview(row: &Row<'_>) -> rusqlite::Result<SeriesOverview> {
    let cover = stored_cover(row)?;
    let folder = cover
        .map(|_| stored_locator(row, ROOT_LOCATOR_KIND_COLUMN))
        .transpose()?;
    Ok(SeriesOverview {
        id: stored_id(row, "id")?,
        title: row.get("title")?,
        book_count: row.get("book_count")?,
        read_count: row.get("read_count")?,
        cover,
        folder,
        pages_left: counted_pages_left(row)?,
        is_rated_adult: row.get("is_rated_adult")?,
    })
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
            (3, 1),
        );
        expected
            .push("SEARCH library_root USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN".to_owned());
        assert_eq!(plan, expected);
    }
}
