use omnileaf_sync_proto::{BookId, SeriesId};
use rusqlite::{Connection, Row, ToSql};

use crate::{
    Error,
    catalog::{
        cursor::{Cursor, Position},
        page::{Page, PageRequest},
        search_text::Lookup,
        series_listing::{FilterParams, adult_condition, smart_conditions},
        series_search::SeriesSearch,
        staged_rows::snapshot,
        stored_id::stored_id,
    },
};

pub const CHAPTER_CANDIDATES_PER_CALL: u32 = 2_000;

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

const CANDIDATE_WINDOW_END: &str = "SELECT rowid FROM book_title_fts
    WHERE book_title_fts MATCH :phrases AND rowid > :after
    ORDER BY rowid LIMIT 2 OFFSET :before_last_candidate";

const CANDIDATE_WINDOW_END_OF_SERIES_NOT_HIDDEN_AS_ADULT: &str = concat!(
    "SELECT book_title_fts.rowid FROM book_title_fts
    JOIN book_title_search ON book_title_search.id = book_title_fts.rowid
    JOIN book ON book.id = book_title_search.book_id
    JOIN series ON series.local_id = book.series_local_id
    WHERE book_title_fts MATCH :phrases AND book_title_fts.rowid > :after
        AND ",
    adult_condition!(),
    " ORDER BY book_title_fts.rowid LIMIT 2 OFFSET :before_last_candidate"
);

macro_rules! candidates_of_shown_series {
    () => {
        concat!(
            "FROM book_title_fts
            JOIN book_title_search ON book_title_search.id = book_title_fts.rowid
            JOIN book ON book.id = book_title_search.book_id
            JOIN series ON series.local_id = book.series_local_id
            WHERE book_title_fts MATCH :phrases
                AND book_title_fts.rowid > :after AND book_title_fts.rowid <= :window_end
                AND series.reading_stage IN (:unstarted, :in_progress, :finished)",
            smart_conditions!()
        )
    };
}

const HITS: &str = concat!(
    "SELECT book_title_fts.rowid AS id, book.id AS book, series.id AS series,
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
        (SELECT count(*) FROM book AS earlier
            WHERE earlier.series_local_id = book.series_local_id
                AND (earlier.reading_order_key, earlier.id) < (book.reading_order_key, book.id)
        ) + 1 AS position ",
    candidates_of_shown_series!(),
    " ORDER BY book_title_fts.rowid LIMIT :limit"
);

const BOOKS_COUNT: &str = concat!(
    "SELECT count(DISTINCT book.id) ",
    candidates_of_shown_series!()
);

struct CandidateWindow<'p> {
    phrases: &'p str,
    after: i64,
    last_id: i64,
    leaves_more: bool,
}

impl<'p> CandidateWindow<'p> {
    fn read(
        connection: &Connection,
        phrases: &'p str,
        after: i64,
        filter: &FilterParams,
    ) -> Result<Self, Error> {
        let before_last_candidate = i64::from(CHAPTER_CANDIDATES_PER_CALL) - 1;
        let mut params: Vec<(&str, &dyn ToSql)> = vec![
            (":phrases", &phrases),
            (":after", &after),
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
            after,
            last_id,
            leaves_more,
        })
    }

    fn bound(&self) -> [(&'static str, &dyn ToSql); 3] {
        [
            (":phrases", &self.phrases),
            (":after", &self.after),
            (":window_end", &self.last_id),
        ]
    }

    fn resumes_at(&self) -> Option<Cursor> {
        self.leaves_more.then_some(Cursor(Position::Chapter {
            index_id: self.last_id,
        }))
    }
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
    let window = CandidateWindow::read(connection, phrases, after, &filter)?;
    let limit = request.size.rows_to_fetch();
    let mut params = filter.named().to_vec();
    params.extend_from_slice(&window.bound());
    params.push((":limit", &limit));
    let rows = connection
        .prepare_cached(HITS)?
        .query_map(params.as_slice(), |row| Ok((hit(row)?, place(row)?)))?
        .collect::<Result<Vec<_>, _>>()?;
    let page = Page::of(rows, request.size);
    Ok(Page {
        items: page.items.into_iter().flatten().collect(),
        next: page.next.or_else(|| window.resumes_at()),
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
    let window = CandidateWindow::read(connection, phrases, BEFORE_FIRST_CANDIDATE, &filter)?;
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

fn hit(row: &Row<'_>) -> rusqlite::Result<Option<ChapterHit>> {
    if row.get("is_found_by_comic_info_too")? {
        return Ok(None);
    }
    Ok(Some(ChapterHit {
        series: stored_id(row, "series")?,
        series_title: row.get("series_title")?,
        book: stored_id(row, "book")?,
        position: row.get("position")?,
        title: row.get("title")?,
        matched_in: if row.get("is_comic_info")? {
            ChapterTitleSource::ComicInfo
        } else {
            ChapterTitleSource::FileName
        },
    }))
}

fn place(row: &Row<'_>) -> rusqlite::Result<Position> {
    Ok(Position::Chapter {
        index_id: row.get("id")?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{catalog::staged_rows::plans::tag_probe_steps, scratch::ScratchLibrary};

    fn candidates_walked(index: &str, tag_probe: u8) -> Vec<String> {
        [
            format!("SCAN book_title_fts VIRTUAL TABLE INDEX {index}"),
            "SEARCH book_title_search USING INTEGER PRIMARY KEY (rowid=?)".to_owned(),
            "SEARCH book USING PRIMARY KEY (id=?)".to_owned(),
            "SEARCH series USING INTEGER PRIMARY KEY (rowid=?)".to_owned(),
        ]
        .into_iter()
        .chain(tag_probe_steps(tag_probe))
        .collect()
    }

    #[test]
    fn reads_the_window_of_candidates_from_the_full_text_index_in_row_order_without_sorting() {
        let scratch = ScratchLibrary::new("chapter-window-plan");

        let plan = scratch.query_plan(CANDIDATE_WINDOW_END);

        assert_eq!(plan, ["SCAN book_title_fts VIRTUAL TABLE INDEX 64:M1>"]);
    }

    #[test]
    fn reads_the_window_of_candidates_of_series_not_hidden_as_adult_in_row_order_without_sorting() {
        let scratch = ScratchLibrary::new("chapter-window-adult-plan");

        let plan = scratch.query_plan(CANDIDATE_WINDOW_END_OF_SERIES_NOT_HIDDEN_AS_ADULT);

        assert_eq!(
            plan,
            [
                "SCAN book_title_fts VIRTUAL TABLE INDEX 64:M1>",
                "SEARCH book_title_search USING INTEGER PRIMARY KEY (rowid=?)",
                "SEARCH book USING PRIMARY KEY (id=?)",
                "SEARCH series USING INTEGER PRIMARY KEY (rowid=?)",
            ]
        );
    }

    #[test]
    fn walks_the_candidates_in_row_order_reaching_each_book_and_series_by_primary_key() {
        let scratch = ScratchLibrary::new("chapter-hits-plan");

        let plan = scratch.query_plan(HITS);

        let for_each_hit_returned = [
            "CORRELATED SCALAR SUBQUERY 2",
            "SEARCH comic_info USING COVERING INDEX sqlite_autoindex_book_title_search_1 (book_id=? AND kind=?)",
            "SCAN book_title_fts EXISTS VIRTUAL TABLE INDEX 0:=M1",
            "CORRELATED SCALAR SUBQUERY 3",
            "SEARCH earlier USING COVERING INDEX book_by_series (series_local_id=? AND (reading_order_key,id)<(?,?))",
        ];
        assert_eq!(
            plan,
            candidates_walked("64:M1><", 5)
                .into_iter()
                .chain(for_each_hit_returned.map(ToOwned::to_owned))
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
                .chain(candidates_walked("0:M1><", 2))
                .collect::<Vec<_>>()
        );
    }
}
