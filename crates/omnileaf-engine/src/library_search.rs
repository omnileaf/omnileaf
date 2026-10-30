use omnileaf_db::{
    Connection,
    catalog::{
        ChapterSuggestion, Page, PageRequest, SearchText, SeriesFilter, SeriesListing, SeriesOrder,
        SeriesSearch, SeriesSort, SeriesSummary, closest_chapter_title, closest_title_words,
        search_chapters, search_chapters_count, search_count, search_page, series_count,
        series_page,
    },
};
use serde::{Deserialize, Serialize};
use specta::Type;

use crate::{ChapterHitPage, LibraryFilter, adult_content::AdultView};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySearch {
    /// Text of nothing but white space finds every series the filter lets through.
    pub text: String,
    pub filter: LibraryFilter,
}

impl LibrarySearch {
    pub const MAX_CHARS: u16 = SearchText::MAX_CHARS;
}

/// What a search that found nothing was likely meant to be.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SpellingSuggestion {
    pub text: String,
    /// The series holding the chapter, when the text is a chapter title rather than a series'.
    pub chapter_of: Option<String>,
}

impl SpellingSuggestion {
    fn of_series(text: String) -> Self {
        Self {
            text,
            chapter_of: None,
        }
    }

    fn of_chapter(suggestion: ChapterSuggestion, adult: AdultView) -> Self {
        Self {
            text: suggestion.chapter_words,
            chapter_of: (!adult.in_screenshot_mode()).then_some(suggestion.series_title),
        }
    }
}

pub(crate) fn spelling_suggestion(
    connection: &Connection,
    text: &str,
    adult: AdultView,
) -> Result<Option<SpellingSuggestion>, omnileaf_db::Error> {
    if text.chars().count() > usize::from(LibrarySearch::MAX_CHARS) {
        return Ok(None);
    }
    if let Some(series_words) = closest_title_words(connection, text, adult.hiding())? {
        return Ok(Some(SpellingSuggestion::of_series(series_words)));
    }
    Ok(
        closest_chapter_title(connection, text, adult.hiding_every_hidden_adult_series())?
            .map(|chapter| SpellingSuggestion::of_chapter(chapter, adult)),
    )
}

pub(crate) enum StoredSearch {
    Text(SeriesSearch),
    Filter(SeriesFilter),
}

impl StoredSearch {
    pub(crate) fn parse(
        search: &LibrarySearch,
        now_ms: i64,
        adult: AdultView,
        seconds_per_page: Option<u32>,
    ) -> Result<Self, omnileaf_db::Error> {
        let filter = search.filter.at(now_ms, adult, seconds_per_page);
        Ok(match SearchText::parse(&search.text)? {
            Some(text) => Self::Text(SeriesSearch { text, filter }),
            None => Self::Filter(filter),
        })
    }

    pub(crate) fn page(
        &self,
        connection: &Connection,
        request: &PageRequest,
    ) -> Result<Page<SeriesSummary>, omnileaf_db::Error> {
        match self {
            Self::Text(search) => search_page(connection, search, request),
            Self::Filter(filter) => series_page(connection, &by_title(filter.clone()), request),
        }
    }

    pub(crate) fn chapters(
        &self,
        connection: &Connection,
        request: &PageRequest,
    ) -> Result<ChapterHitPage, omnileaf_db::Error> {
        let Self::Text(search) = self else {
            return Ok(ChapterHitPage::empty());
        };
        Ok(ChapterHitPage::new(
            search_chapters(connection, search, request)?,
            search_chapters_count(connection, search)?,
        ))
    }

    pub(crate) fn count(&self, connection: &Connection) -> Result<u32, omnileaf_db::Error> {
        match self {
            Self::Text(search) => search_count(connection, search),
            Self::Filter(filter) => series_count(connection, filter),
        }
    }
}

const fn by_title(filter: SeriesFilter) -> SeriesListing {
    SeriesListing {
        sort: SeriesSort::ascending(SeriesOrder::Title),
        filter,
    }
}
