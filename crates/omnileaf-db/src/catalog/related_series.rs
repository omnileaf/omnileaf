use omnileaf_sync_proto::SeriesId;
use rusqlite::{Connection, OptionalExtension, Row};

use crate::{
    Error,
    catalog::{Cover, cover::stored_cover, staged_rows::snapshot, stored_id::stored_id},
};

/// How many books may carry a tag before it counts as no rarer than any other.
const TAG_SPREAD_CAP: i64 = 500;

macro_rules! series_sharing_people {
    ($roles:literal) => {
        concat!(
            "WITH this AS (SELECT local_id FROM series WHERE id = :series),
            named AS (
                SELECT DISTINCT book_person.name FROM book
                JOIN book_person ON book_person.book_id = book.id
                WHERE book.series_local_id = (SELECT local_id FROM this)
                    AND book_person.role IN ",
            $roles,
            ")
            SELECT DISTINCT other.series_local_id AS local_id FROM named
            JOIN book_person AS theirs ON theirs.name = named.name AND theirs.role IN ",
            $roles,
            " JOIN book AS other ON other.id = theirs.book_id
            JOIN series ON series.local_id = other.series_local_id
            WHERE other.series_local_id IS NOT (SELECT local_id FROM this)
                AND series.reading_stage IS NOT NULL
                AND NOT (:leaves_out_adult AND series.adult_rated_books > 0)
            LIMIT :limit"
        )
    };
}

const SERIES_SHARING_A_WRITER: &str = series_sharing_people!("('writer')");
const SERIES_SHARING_AN_ARTIST: &str =
    series_sharing_people!("('penciller', 'inker', 'colourist', 'cover_artist')");
const TAGS_OF_SERIES: &str = "SELECT DISTINCT book_tag.name FROM book
    JOIN book_tag ON book_tag.book_id = book.id
    WHERE book.series_local_id = (SELECT local_id FROM series WHERE id = ?1)";
const TAG_SPREAD: &str =
    "SELECT count(*) FROM (SELECT DISTINCT book_id FROM book_tag WHERE name = ?1 LIMIT ?2)";
const SERIES_SHARING_A_TAG: &str = "SELECT DISTINCT other.series_local_id AS local_id
    FROM book_tag
    JOIN book AS other ON other.id = book_tag.book_id
    JOIN series ON series.local_id = other.series_local_id
    WHERE book_tag.name = :tag
        AND other.series_local_id IS NOT (SELECT local_id FROM series WHERE id = :series)
        AND series.reading_stage IS NOT NULL
        AND NOT (:leaves_out_adult AND series.adult_rated_books > 0)
    LIMIT :limit";
const RELATED_SERIES: &str = concat!(
    "SELECT series.id AS id, series.title, series.title_key, series.book_count,
        series.read_count, series.adult_rated_books > 0 AS is_rated_adult,
        cover.book_id AS cover_book, cover.id AS cover_file, cover.rev AS cover_rev
    FROM series ",
    crate::catalog::cover::join_series_cover!(),
    " WHERE series.local_id = ?1"
);

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RelatedSeries {
    pub id: SeriesId,
    pub title: String,
    pub cover: Option<Cover>,
    pub book_count: u32,
    pub read_count: u32,
    pub is_rated_adult: bool,
    pub reason: RelatedReason,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum RelatedReason {
    SameWriter,
    SameArtist,
    SharedTag(String),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct RelatedSeriesWanted {
    pub limit: usize,
    /// Leaves out the series whose files rate a book 18+.
    pub leaves_out_adult: bool,
}

struct Candidate {
    local_id: i64,
    reason: RelatedReason,
}

/// Up to `limit` other series in the library sharing a writer, then an artist, then a tag with the series, rarest tag first, each listed once under its closest tie and in title order within it.
#[tracing::instrument(skip_all, fields(%series, limit))]
pub fn related_series(
    connection: &Connection,
    series: SeriesId,
    wanted: RelatedSeriesWanted,
) -> Result<Vec<RelatedSeries>, Error> {
    let _snapshot = snapshot(connection)?;
    let RelatedSeriesWanted {
        limit,
        leaves_out_adult,
    } = wanted;
    let mut chosen: Vec<Candidate> = Vec::new();
    for (query, reason) in [
        (SERIES_SHARING_A_WRITER, RelatedReason::SameWriter),
        (SERIES_SHARING_AN_ARTIST, RelatedReason::SameArtist),
    ] {
        let found = sharing(
            connection,
            query,
            &[
                (":series", &series.as_bytes()),
                (":leaves_out_adult", &leaves_out_adult),
            ],
            chosen.len() + limit,
        )?;
        choose(&mut chosen, found, &reason, limit);
    }
    if chosen.len() >= limit {
        return read_chosen(connection, chosen);
    }
    for tag in tags_rarest_first(connection, series)? {
        if chosen.len() >= limit {
            break;
        }
        let found = sharing(
            connection,
            SERIES_SHARING_A_TAG,
            &[
                (":series", &series.as_bytes()),
                (":tag", &tag),
                (":leaves_out_adult", &leaves_out_adult),
            ],
            chosen.len() + limit,
        )?;
        choose(&mut chosen, found, &RelatedReason::SharedTag(tag), limit);
    }
    read_chosen(connection, chosen)
}

fn sharing(
    connection: &Connection,
    query: &str,
    bound: &[(&str, &dyn rusqlite::ToSql)],
    limit: usize,
) -> Result<Vec<i64>, Error> {
    let limit = i64::try_from(limit).unwrap_or(i64::MAX);
    let mut params = bound.to_vec();
    params.push((":limit", &limit));
    Ok(connection
        .prepare(query)?
        .query_map(params.as_slice(), |row| row.get("local_id"))?
        .collect::<Result<_, _>>()?)
}

fn choose(chosen: &mut Vec<Candidate>, found: Vec<i64>, reason: &RelatedReason, limit: usize) {
    for local_id in found {
        if chosen.len() >= limit {
            return;
        }
        if chosen
            .iter()
            .all(|candidate| candidate.local_id != local_id)
        {
            chosen.push(Candidate {
                local_id,
                reason: reason.clone(),
            });
        }
    }
}

fn tags_rarest_first(connection: &Connection, series: SeriesId) -> Result<Vec<String>, Error> {
    let tags: Vec<String> = connection
        .prepare(TAGS_OF_SERIES)?
        .query_map([series.as_bytes()], |row| row.get(0))?
        .collect::<Result<_, _>>()?;
    let mut spread = connection.prepare(TAG_SPREAD)?;
    let mut counted: Vec<(i64, String)> = tags
        .into_iter()
        .map(|tag| {
            Ok((
                spread.query_row((&tag, TAG_SPREAD_CAP), |row| row.get(0))?,
                tag,
            ))
        })
        .collect::<Result<_, Error>>()?;
    counted.sort();
    Ok(counted.into_iter().map(|(_, tag)| tag).collect())
}

fn read_chosen(
    connection: &Connection,
    chosen: Vec<Candidate>,
) -> Result<Vec<RelatedSeries>, Error> {
    let mut statement = connection.prepare(RELATED_SERIES)?;
    let mut read: Vec<(Vec<u8>, RelatedSeries)> = Vec::with_capacity(chosen.len());
    for Candidate { local_id, reason } in chosen {
        if let Some(found) = statement
            .query_row([local_id], |row| related(row, reason))
            .optional()?
        {
            read.push(found);
        }
    }
    read.sort_by(|(left_key, left), (right_key, right)| {
        closeness(&left.reason)
            .cmp(&closeness(&right.reason))
            .then_with(|| left_key.cmp(right_key))
    });
    Ok(read.into_iter().map(|(_, series)| series).collect())
}

const fn closeness(reason: &RelatedReason) -> u8 {
    match reason {
        RelatedReason::SameWriter => 0,
        RelatedReason::SameArtist => 1,
        RelatedReason::SharedTag(_) => 2,
    }
}

fn related(row: &Row<'_>, reason: RelatedReason) -> rusqlite::Result<(Vec<u8>, RelatedSeries)> {
    Ok((
        row.get("title_key")?,
        RelatedSeries {
            id: stored_id(row, "id")?,
            title: row.get("title")?,
            cover: stored_cover(row)?,
            book_count: row.get("book_count")?,
            read_count: row.get("read_count")?,
            is_rated_adult: row.get("is_rated_adult")?,
            reason,
        },
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scratch::ScratchLibrary;

    #[test]
    fn finds_the_series_sharing_a_writer_through_the_name_index() {
        let scratch = ScratchLibrary::new("series-sharing-writer-plan");

        let plan = scratch.query_plan(SERIES_SHARING_A_WRITER);

        assert_eq!(
            plan,
            [
                "CO-ROUTINE named",
                "SEARCH book USING COVERING INDEX book_by_series_and_added (series_local_id=?)",
                "SCALAR SUBQUERY 2",
                "SEARCH series USING COVERING INDEX sqlite_autoindex_series_1 (id=?)",
                "SEARCH book_person USING PRIMARY KEY (book_id=? AND role=?)",
                "USE TEMP B-TREE FOR DISTINCT",
                "SCAN named",
                "SEARCH theirs USING COVERING INDEX book_person_by_name (name=?)",
                "SEARCH other USING PRIMARY KEY (id=?)",
                "SCALAR SUBQUERY 4",
                "SEARCH series USING COVERING INDEX sqlite_autoindex_series_1 (id=?)",
                "SEARCH series USING INTEGER PRIMARY KEY (rowid=?)",
                "USE TEMP B-TREE FOR DISTINCT",
            ]
        );
    }

    #[test]
    fn finds_the_series_sharing_a_tag_through_the_tag_index() {
        let scratch = ScratchLibrary::new("series-sharing-tag-plan");

        let plan = scratch.query_plan(SERIES_SHARING_A_TAG);

        assert_eq!(
            plan,
            [
                "SEARCH book_tag USING COVERING INDEX book_tag_by_name (name=?)",
                "SEARCH other USING PRIMARY KEY (id=?)",
                "SCALAR SUBQUERY 1",
                "SEARCH series USING COVERING INDEX sqlite_autoindex_series_1 (id=?)",
                "SEARCH series USING INTEGER PRIMARY KEY (rowid=?)",
                "USE TEMP B-TREE FOR DISTINCT",
            ]
        );
    }

    #[test]
    fn counts_how_many_books_carry_a_tag_through_the_tag_index_up_to_a_cap() {
        let scratch = ScratchLibrary::new("tag-spread-plan");

        let plan = scratch.query_plan(TAG_SPREAD);

        assert_eq!(
            plan,
            [
                "CO-ROUTINE (subquery-1)",
                "SEARCH book_tag USING COVERING INDEX book_tag_by_name (name=?)",
                "SCAN (subquery-1)",
            ]
        );
    }

    #[test]
    fn reads_a_series_tags_through_its_books() {
        let scratch = ScratchLibrary::new("tags-of-series-plan");

        let plan = scratch.query_plan(TAGS_OF_SERIES);

        assert_eq!(
            plan,
            [
                "SEARCH book USING COVERING INDEX book_by_series_and_added (series_local_id=?)",
                "SCALAR SUBQUERY 1",
                "SEARCH series USING COVERING INDEX sqlite_autoindex_series_1 (id=?)",
                "SEARCH book_tag USING PRIMARY KEY (book_id=?)",
                "USE TEMP B-TREE FOR DISTINCT",
            ]
        );
    }
}
