use std::path::PathBuf;

use omnileaf_sync_proto::SeriesId;
use rusqlite::{Connection, OptionalExtension, Row};

use crate::{
    Error,
    catalog::{BookNumber, Cover, cover::stored_cover, native_path},
    reading_order::volume_keys,
};

const VOLUME_OF_SERIES: &str = "SELECT
        (SELECT count(*) FROM book
            WHERE book.series_local_id = series.local_id
                AND book.reading_order_key >= :start AND book.reading_order_key < :end)
            AS book_count,
        (SELECT count(*) FROM book JOIN book_state ON book_state.book_id = book.id
            WHERE book.series_local_id = series.local_id
                AND book.reading_order_key >= :start AND book.reading_order_key < :end
                AND book_state.is_read = 1) AS read_count,
        cover.book_id AS cover_book, cover.id AS cover_file, cover.rev AS cover_rev,
        cover.location AS cover_location
    FROM series
    LEFT JOIN book_file AS cover ON cover.id = (
        SELECT (SELECT min(book_file.id) FROM book_file WHERE book_file.book_id = book.id)
        FROM book
        WHERE book.series_local_id = series.local_id
            AND book.reading_order_key >= :start AND book.reading_order_key < :end
            AND EXISTS (SELECT 1 FROM book_file WHERE book_file.book_id = book.id)
        ORDER BY book.reading_order_key, book.id
        LIMIT 1
    )
    WHERE series.id = :series";

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct VolumeOverview {
    pub book_count: u32,
    pub read_count: u32,
    /// The cover of the volume's first chapter that has a file.
    pub cover: Option<Cover>,
    /// Where that chapter's file lies in its library folder, whose parent is the volume's folder.
    pub cover_location: Option<PathBuf>,
}

/// None for a series missing from the catalog or a volume holding no chapters.
#[tracing::instrument(skip_all, fields(%series, volume = volume.thousandths()))]
pub fn series_volume(
    connection: &Connection,
    series: SeriesId,
    volume: BookNumber,
) -> Result<Option<VolumeOverview>, Error> {
    let (start, end) = volume_keys(volume);
    Ok(connection
        .prepare(VOLUME_OF_SERIES)?
        .query_row(
            rusqlite::named_params! {
                ":series": series.as_bytes(),
                ":start": start,
                ":end": end,
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
        cover,
        cover_location,
    })
}
