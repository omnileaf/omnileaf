use std::path::PathBuf;

use omnileaf_sync_proto::SeriesId;
use rusqlite::{Connection, OptionalExtension, Row};

use crate::{
    Error,
    catalog::{
        BookNumber, Cover, ValueSource, cover::stored_cover, native_path, series_books::in_range,
    },
    reading_order::volume_keys,
};

macro_rules! chapters_in_volume {
    () => {
        concat!("book.series_local_id = series.local_id AND ", in_range!())
    };
}

const VOLUME_OF_SERIES: &str = concat!(
    "SELECT
        (SELECT count(*) FROM book WHERE ",
    chapters_in_volume!(),
    ") AS book_count,
        (SELECT count(*) FROM book JOIN book_state ON book_state.book_id = book.id
            WHERE ",
    chapters_in_volume!(),
    " AND book_state.is_read = 1) AS read_count,
        (SELECT CASE WHEN count(*) = count(book.page_count) THEN sum(book.page_count) END
            FROM book WHERE ",
    chapters_in_volume!(),
    ") AS page_count,
        cover.book_id AS cover_book, cover.id AS cover_file, cover.rev AS cover_rev,
        cover.location AS cover_location,
        (SELECT volume_source FROM book WHERE book.id = cover.book_id) AS volume_source
    FROM series
    LEFT JOIN book_file AS cover ON cover.id = (
        SELECT (SELECT min(book_file.id) FROM book_file WHERE book_file.book_id = book.id)
        FROM book
        WHERE ",
    chapters_in_volume!(),
    " AND EXISTS (SELECT 1 FROM book_file WHERE book_file.book_id = book.id)
        ORDER BY book.reading_order_key, book.id
        LIMIT 1
    )
    WHERE series.id = :series"
);

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct VolumeOverview {
    pub book_count: u32,
    pub read_count: u32,
    pub page_count: Option<u32>,
    /// The cover of the volume's first chapter that has a file.
    pub cover: Option<Cover>,
    /// Where that chapter's file lies in its library folder, whose parent is the volume's folder.
    pub cover_location: Option<PathBuf>,
    /// Where that chapter's volume number was read from, absent while the volume has no chapter with a file.
    pub volume_source: Option<ValueSource>,
}

/// None for a series missing from the catalog or a volume holding no chapters.
#[tracing::instrument(skip_all, fields(%series, volume = volume.thousandths()))]
pub fn series_volume(
    connection: &Connection,
    series: SeriesId,
    volume: BookNumber,
) -> Result<Option<VolumeOverview>, Error> {
    let keys = volume_keys(volume);
    Ok(connection
        .prepare(VOLUME_OF_SERIES)?
        .query_row(
            rusqlite::named_params! {
                ":series": series.as_bytes(),
                ":range_start": keys.start,
                ":range_end": keys.end,
            },
            overview,
        )
        .optional()?
        .filter(|found| found.book_count > 0))
}

fn overview(row: &Row<'_>) -> rusqlite::Result<VolumeOverview> {
    let cover = stored_cover(row)?;
    let cover_location = cover
        .map(|_| native_path::stored_native_path(row, row.as_ref().column_index("cover_location")?))
        .transpose()?;
    Ok(VolumeOverview {
        book_count: row.get("book_count")?,
        read_count: row.get("read_count")?,
        page_count: row.get("page_count")?,
        cover,
        cover_location,
        volume_source: row.get("volume_source")?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scratch::ScratchLibrary;

    const CHAPTERS_BY_INDEX: &str = "SEARCH book USING COVERING INDEX book_by_series (series_local_id=? AND reading_order_key>? AND reading_order_key<?)";

    #[test]
    fn sums_up_a_volume_by_searching_its_chapters_by_index_without_scanning_or_sorting() {
        let scratch = ScratchLibrary::new("volume-overview-plan");

        let plan = scratch.query_plan(VOLUME_OF_SERIES);

        assert_eq!(
            plan,
            [
                "SEARCH series USING COVERING INDEX sqlite_autoindex_series_1 (id=?)",
                "SEARCH cover USING INTEGER PRIMARY KEY (rowid=?) LEFT-JOIN",
                "CORRELATED SCALAR SUBQUERY 7",
                CHAPTERS_BY_INDEX,
                "SEARCH book_file EXISTS USING COVERING INDEX book_file_by_book (book_id=?)",
                "CORRELATED SCALAR SUBQUERY 5",
                "SEARCH book_file USING COVERING INDEX book_file_by_book (book_id=?)",
                "CORRELATED SCALAR SUBQUERY 1",
                CHAPTERS_BY_INDEX,
                "CORRELATED SCALAR SUBQUERY 2",
                CHAPTERS_BY_INDEX,
                "SEARCH book_state USING PRIMARY KEY (book_id=?)",
                "CORRELATED SCALAR SUBQUERY 3",
                "SEARCH book USING INDEX book_by_series (series_local_id=? AND reading_order_key>? AND reading_order_key<?)",
                "CORRELATED SCALAR SUBQUERY 4",
                "SEARCH book USING PRIMARY KEY (id=?)",
            ]
        );
    }
}
