use omnileaf_sync_proto::SeriesId;
use rusqlite::{Connection, Row, named_params};

use crate::{
    Error,
    catalog::{BookNumber, BookSection, series_books::in_range, staged_rows::snapshot},
    reading_order::section_keys,
};

const CHAPTER_VOLUMES_OF_SERIES: &str = concat!(
    "SELECT book.volume_number AS volume,
        count(*) AS book_count,
        count(CASE WHEN book_state.is_read IS 1 THEN 1 END) AS read_count,
        count(CASE WHEN book_state.is_started THEN 1 END) AS started_count
    FROM series
    JOIN book ON book.series_local_id = series.local_id
    LEFT JOIN book_state ON book_state.book_id = book.id
    WHERE series.id = :series AND ",
    in_range!(),
    " AND book.volume_number IS NOT NULL
    GROUP BY book.volume_number
    ORDER BY book.volume_number"
);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ChapterVolume {
    pub volume: BookNumber,
    pub book_count: u32,
    pub read_count: u32,
    pub started_count: u32,
}

#[tracing::instrument(skip_all, fields(%series))]
pub fn series_chapter_volumes(
    connection: &Connection,
    series: SeriesId,
) -> Result<Vec<ChapterVolume>, Error> {
    let _snapshot = snapshot(connection)?;
    let keys = section_keys(BookSection::Volumes);
    let mut statement = connection.prepare(CHAPTER_VOLUMES_OF_SERIES)?;
    let counted = statement
        .query_map(
            named_params! {
                ":series": series.as_bytes(),
                ":range_start": keys.start,
                ":range_end": keys.end,
            },
            chapter_volume,
        )?
        .collect::<Result<_, _>>()?;
    Ok(counted)
}

fn chapter_volume(row: &Row<'_>) -> rusqlite::Result<ChapterVolume> {
    Ok(ChapterVolume {
        volume: row.get("volume")?,
        book_count: row.get("book_count")?,
        read_count: row.get("read_count")?,
        started_count: row.get("started_count")?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scratch::ScratchLibrary;

    #[test]
    fn counts_volumes_of_chapters_from_the_series_volumes_by_index_grouping_only_those_rows() {
        let scratch = ScratchLibrary::new("chapter-volumes-plan");

        let plan = scratch.query_plan(CHAPTER_VOLUMES_OF_SERIES);

        assert_eq!(
            plan,
            [
                "SEARCH series USING COVERING INDEX sqlite_autoindex_series_1 (id=?)",
                "SEARCH book USING INDEX book_by_series (series_local_id=? AND reading_order_key>? AND reading_order_key<?)",
                "SEARCH book_state USING PRIMARY KEY (book_id=?) LEFT-JOIN",
                "USE TEMP B-TREE FOR GROUP BY",
            ]
        );
    }
}
