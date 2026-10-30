use omnileaf_sync_proto::{BookId, SeriesId};
use rusqlite::{Connection, Row, ToSql, named_params};

use crate::{
    Error,
    catalog::{
        chapter_positions::{ReadingOrder, places},
        cursor::{Cursor, Position},
        page::{Page, PageRequest},
        search_text::Lookup,
        series_listing::{FilterParams, adult_condition, smart_conditions},
        series_search::SeriesSearch,
        staged_rows::snapshot,
        stored_id::stored_id,
    },
};

pub const CHAPTER_CANDIDATES_PER_CALL: u32 = 1_000;

const BEFORE_FIRST_CANDIDATE: i64 = 0;
const AFTER_LAST_CANDIDATE: i64 = i64::MAX;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ChapterTitleSource {
    FileName,
    ComicInfo,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ChapterHit {
    pub series: SeriesId,
    pub series_title: String,
    pub book: BookId,
    pub position: u32,
    pub title: String,
    pub matched_in: ChapterTitleSource,
}

macro_rules! candidate_tables {
    () => {
        "book_title_fts
        CROSS JOIN book_title_search ON book_title_search.id = book_title_fts.rowid
        CROSS JOIN book ON book.id = book_title_search.book_id
        CROSS JOIN series ON series.local_id = book.series_local_id"
    };
}

const CANDIDATE_WINDOW_END: &str = "SELECT rowid FROM book_title_fts
    WHERE book_title_fts MATCH :phrases
    ORDER BY rowid LIMIT 2 OFFSET :before_last_candidate";

const CANDIDATE_WINDOW_END_OF_SERIES_NOT_HIDDEN_AS_ADULT: &str = concat!(
    "SELECT book_title_fts.rowid FROM ",
    candidate_tables!(),
    " WHERE book_title_fts MATCH :phrases AND ",
    adult_condition!(),
    " ORDER BY book_title_fts.rowid LIMIT 2 OFFSET :before_last_candidate"
);

const CANDIDATES_AFTER: &str = concat!(
    "SELECT book_title_fts.rowid AS id,
        coalesce(series.reading_stage IN (:unstarted, :in_progress, :finished)",
    smart_conditions!(),
    ", FALSE) AS is_hit FROM ",
    candidate_tables!(),
    " WHERE book_title_fts MATCH :phrases AND book_title_fts.rowid > :after AND ",
    adult_condition!(),
    " ORDER BY book_title_fts.rowid"
);

const HITS_AMONG: &str = "SELECT book_title_search.id, book.id AS book, series.id AS series,
        series.title AS series_title, book_title_search.kind = 'comic_info' AS is_comic_info,
        book_title_search.title,
        book_title_search.kind = 'file_name' AND EXISTS (
            SELECT 1 FROM book_title_search AS comic_info
            WHERE comic_info.book_id = book_title_search.book_id
                AND comic_info.kind = 'comic_info'
                AND EXISTS (
                    SELECT 1 FROM book_title_fts
                    WHERE book_title_fts MATCH :phrases AND rowid = comic_info.id)
        ) AS is_found_by_comic_info_too,
        book.series_local_id, book.reading_order_key
    FROM json_each(:ids)
    CROSS JOIN book_title_search ON book_title_search.id = json_each.value
    CROSS JOIN book ON book.id = book_title_search.book_id
    CROSS JOIN series ON series.local_id = book.series_local_id
    ORDER BY json_each.key";

const BOOKS_COUNT: &str = concat!(
    "SELECT count(DISTINCT book.id) FROM ",
    candidate_tables!(),
    " WHERE book_title_fts MATCH :phrases AND book_title_fts.rowid <= :window_end
        AND series.reading_stage IN (:unstarted, :in_progress, :finished)",
    smart_conditions!()
);

struct CandidateWindow<'p> {
    phrases: &'p str,
    last_id: i64,
    leaves_more: bool,
}

impl<'p> CandidateWindow<'p> {
    fn read(
        connection: &Connection,
        phrases: &'p str,
        filter: &FilterParams,
    ) -> Result<Self, Error> {
        let before_last_candidate = i64::from(CHAPTER_CANDIDATES_PER_CALL) - 1;
        let mut params: Vec<(&str, &dyn ToSql)> = vec![
            (":phrases", &phrases),
            (":before_last_candidate", &before_last_candidate),
        ];
        let sql = if filter.hides_adult() {
            params.extend_from_slice(&filter.named_adult());
            CANDIDATE_WINDOW_END_OF_SERIES_NOT_HIDDEN_AS_ADULT
        } else {
            CANDIDATE_WINDOW_END
        };
        let ends: Vec<i64> = connection
            .prepare_cached(sql)?
            .query_map(params.as_slice(), |row| row.get(0))?
            .collect::<Result<_, _>>()?;
        let (last_id, leaves_more) = match ends.as_slice() {
            [last_id, _] => (*last_id, true),
            [last_id] => (*last_id, false),
            _ => (AFTER_LAST_CANDIDATE, false),
        };
        Ok(Self {
            phrases,
            last_id,
            leaves_more,
        })
    }

    fn bound(&self) -> [(&'static str, &dyn ToSql); 2] {
        [(":phrases", &self.phrases), (":window_end", &self.last_id)]
    }
}

struct Candidates {
    hit_ids: Vec<i64>,
    resumes_at: Option<Cursor>,
}

impl Candidates {
    fn read(
        connection: &Connection,
        phrases: &str,
        after: i64,
        filter: &FilterParams,
        wanted_hits: usize,
    ) -> Result<Self, Error> {
        let mut params = filter.named().to_vec();
        params.push((":phrases", &phrases));
        params.push((":after", &after));
        let mut statement = connection.prepare_cached(CANDIDATES_AFTER)?;
        let mut rows = statement.query(params.as_slice())?;
        let mut hit_ids = Vec::new();
        let mut examined = 0;
        let mut last_id = after;
        while let Some(row) = rows.next()? {
            if examined == CHAPTER_CANDIDATES_PER_CALL {
                return Ok(Self {
                    hit_ids,
                    resumes_at: Some(Cursor(Position::Chapter { index_id: last_id })),
                });
            }
            examined += 1;
            last_id = row.get("id")?;
            if row.get("is_hit")? {
                hit_ids.push(last_id);
                if hit_ids.len() == wanted_hits {
                    break;
                }
            }
        }
        Ok(Self {
            hit_ids,
            resumes_at: None,
        })
    }
}

fn id_list(ids: &[i64]) -> String {
    let ids: Vec<String> = ids.iter().map(i64::to_string).collect();
    format!("[{}]", ids.join(","))
}

struct HitAwaitingPosition {
    series: SeriesId,
    series_title: String,
    book: BookId,
    title: String,
    matched_in: ChapterTitleSource,
}

impl HitAwaitingPosition {
    fn at(self, position: u32) -> ChapterHit {
        ChapterHit {
            series: self.series,
            series_title: self.series_title,
            book: self.book,
            position,
            title: self.title,
            matched_in: self.matched_in,
        }
    }
}

struct FoundRow {
    hit: Option<HitAwaitingPosition>,
    place_in_index: Position,
    reading_order: ReadingOrder,
}

fn hits_among(
    connection: &Connection,
    phrases: &str,
    ids: &[i64],
) -> Result<Vec<(Option<ChapterHit>, Position)>, Error> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let found = connection
        .prepare_cached(HITS_AMONG)?
        .query_map(
            named_params! { ":phrases": phrases, ":ids": id_list(ids) },
            found,
        )?
        .collect::<Result<Vec<_>, _>>()?;
    let orders: Vec<&ReadingOrder> = found.iter().map(|row| &row.reading_order).collect();
    let places = places(connection, &orders)?;
    Ok(found
        .into_iter()
        .zip(places)
        .map(|(row, position)| (row.hit.map(|hit| hit.at(position)), row.place_in_index))
        .collect())
}

#[tracing::instrument(skip_all, fields(filter = ?search.filter, size = ?request.size))]
pub fn search_chapters(
    connection: &Connection,
    search: &SeriesSearch,
    request: &PageRequest,
) -> Result<Page<ChapterHit>, Error> {
    let Lookup::Phrases(phrases) = &search.text.0 else {
        return Ok(Page {
            items: Vec::new(),
            next: None,
        });
    };
    let after = index_id_after(request.after.as_ref())?;
    let _snapshot = snapshot(connection)?;
    let filter = FilterParams::of(&search.filter);
    let candidates = Candidates::read(
        connection,
        phrases,
        after,
        &filter,
        request.size.items() + 1,
    )?;
    let rows = hits_among(connection, phrases, &candidates.hit_ids)?;
    let page = Page::of(rows, request.size);
    Ok(Page {
        items: page.items.into_iter().flatten().collect(),
        next: page.next.or(candidates.resumes_at),
    })
}

#[tracing::instrument(skip_all, fields(filter = ?search.filter))]
pub fn search_chapters_count(
    connection: &Connection,
    search: &SeriesSearch,
) -> Result<Option<u32>, Error> {
    let Lookup::Phrases(phrases) = &search.text.0 else {
        return Ok(Some(0));
    };
    let _snapshot = snapshot(connection)?;
    let filter = FilterParams::of(&search.filter);
    let window = CandidateWindow::read(connection, phrases, &filter)?;
    if window.leaves_more {
        return Ok(None);
    }
    let mut params = filter.named().to_vec();
    params.extend_from_slice(&window.bound());
    let count: u32 = connection
        .prepare_cached(BOOKS_COUNT)?
        .query_row(params.as_slice(), |row| row.get(0))?;
    Ok(Some(count))
}

fn index_id_after(after: Option<&Cursor>) -> Result<i64, Error> {
    match after.map(|cursor| &cursor.0) {
        None => Ok(BEFORE_FIRST_CANDIDATE),
        Some(Position::Chapter { index_id }) => Ok(*index_id),
        Some(
            Position::Title { .. }
            | Position::Added { .. }
            | Position::Book { .. }
            | Position::Root { .. }
            | Position::LastRead { .. }
            | Position::Session { .. }
            | Position::LastUpdated { .. }
            | Position::UnreadCount { .. }
            | Position::TimeLeft { .. }
            | Position::Writer { .. }
            | Position::FolderGroup { .. },
        ) => Err(Error::CursorForAnotherList),
    }
}

fn found(row: &Row<'_>) -> rusqlite::Result<FoundRow> {
    Ok(FoundRow {
        hit: hit(row)?,
        place_in_index: Position::Chapter {
            index_id: row.get("id")?,
        },
        reading_order: ReadingOrder::of(row)?,
    })
}

fn hit(row: &Row<'_>) -> rusqlite::Result<Option<HitAwaitingPosition>> {
    if row.get("is_found_by_comic_info_too")? {
        return Ok(None);
    }
    Ok(Some(HitAwaitingPosition {
        series: stored_id(row, "series")?,
        series_title: row.get("series_title")?,
        book: stored_id(row, "book")?,
        title: row.get("title")?,
        matched_in: if row.get("is_comic_info")? {
            ChapterTitleSource::ComicInfo
        } else {
            ChapterTitleSource::FileName
        },
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{catalog::staged_rows::plans::tag_probe_steps, scratch::ScratchLibrary};

    fn candidates_walked(index: &str) -> Vec<String> {
        [
            format!("SCAN book_title_fts VIRTUAL TABLE INDEX {index}"),
            "SEARCH book_title_search USING INTEGER PRIMARY KEY (rowid=?)".to_owned(),
            "SEARCH book USING PRIMARY KEY (id=?)".to_owned(),
            "SEARCH series USING INTEGER PRIMARY KEY (rowid=?)".to_owned(),
        ]
        .into()
    }

    #[test]
    fn reads_the_window_of_candidates_from_the_full_text_index_in_row_order_without_sorting() {
        let scratch = ScratchLibrary::new("chapter-window-plan");

        let plan = scratch.query_plan(CANDIDATE_WINDOW_END);

        assert_eq!(plan, ["SCAN book_title_fts VIRTUAL TABLE INDEX 64:M1"]);
    }

    #[test]
    fn reads_the_window_of_candidates_of_series_not_hidden_as_adult_in_row_order_without_sorting() {
        let scratch = ScratchLibrary::new("chapter-window-adult-plan");

        let plan = scratch.query_plan(CANDIDATE_WINDOW_END_OF_SERIES_NOT_HIDDEN_AS_ADULT);

        assert_eq!(plan, candidates_walked("64:M1"));
    }

    #[test]
    fn walks_the_candidates_in_row_order_reaching_each_book_and_series_by_primary_key() {
        let scratch = ScratchLibrary::new("chapter-candidates-plan");

        let plan = scratch.query_plan(CANDIDATES_AFTER);

        assert_eq!(
            plan,
            candidates_walked("64:M1>")
                .into_iter()
                .chain(tag_probe_steps(2))
                .collect::<Vec<_>>()
        );
    }

    #[test]
    fn reads_each_hit_by_primary_key_and_checks_a_book_found_by_both_titles_once() {
        let scratch = ScratchLibrary::new("chapter-hits-plan");

        let plan = scratch.query_plan(HITS_AMONG);

        let for_each_hit_returned = [
            "CORRELATED SCALAR SUBQUERY 2",
            "SEARCH comic_info USING COVERING INDEX sqlite_autoindex_book_title_search_1 (book_id=? AND kind=?)",
            "SCAN book_title_fts EXISTS VIRTUAL TABLE INDEX 0:=M1",
            "USE TEMP B-TREE FOR ORDER BY",
        ];
        assert_eq!(
            plan,
            [
                "SCAN json_each VIRTUAL TABLE INDEX 1:",
                "SEARCH book_title_search USING INTEGER PRIMARY KEY (rowid=?)",
                "SEARCH book USING PRIMARY KEY (id=?)",
                "SEARCH series USING INTEGER PRIMARY KEY (rowid=?)",
            ]
            .into_iter()
            .chain(for_each_hit_returned)
            .map(ToOwned::to_owned)
            .collect::<Vec<_>>()
        );
    }

    #[test]
    fn counts_the_books_of_the_candidates_in_row_order_reaching_each_by_primary_key() {
        let scratch = ScratchLibrary::new("chapter-count-plan");

        let plan = scratch.query_plan(BOOKS_COUNT);

        assert_eq!(
            plan,
            ["USE TEMP B-TREE FOR count(DISTINCT)".to_owned()]
                .into_iter()
                .chain(candidates_walked("0:M1<"))
                .chain(tag_probe_steps(2))
                .collect::<Vec<_>>()
        );
    }
}
