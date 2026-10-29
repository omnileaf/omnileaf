use omnileaf_sync_proto::{BookId, SeriesId};
use rusqlite::Connection;

use crate::{
    Error,
    catalog::{
        page::{Page, PageRequest},
        series_search::SeriesSearch,
    },
};

pub const CHAPTER_CANDIDATES_PER_CALL: u32 = 1_000;

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

#[tracing::instrument(skip_all)]
pub fn search_chapters(
    _connection: &Connection,
    _search: &SeriesSearch,
    _request: &PageRequest,
) -> Result<Page<ChapterHit>, Error> {
    Ok(Page {
        items: Vec::new(),
        next: None,
    })
}

#[tracing::instrument(skip_all)]
pub fn search_chapters_count(
    _connection: &Connection,
    _search: &SeriesSearch,
) -> Result<Option<u32>, Error> {
    Ok(Some(0))
}
