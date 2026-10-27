use omnileaf_db::{
    Connection,
    catalog::{
        Page, PageRequest, SearchText, SeriesFilter, SeriesListing, SeriesOrder, SeriesSearch,
        SeriesSort, SeriesSummary, closest_title_words, search_count, search_page, series_count,
        series_page,
    },
};
use serde::{Deserialize, Serialize};
use specta::Type;

use crate::LibraryFilter;

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

pub(crate) fn spelling_suggestion(
    connection: &Connection,
    text: &str,
) -> Result<Option<SpellingSuggestion>, omnileaf_db::Error> {
    if text.chars().count() > usize::from(LibrarySearch::MAX_CHARS) {
        return Ok(None);
    }
    Ok(
        closest_title_words(connection, text)?.map(|text| SpellingSuggestion {
            text,
            chapter_of: None,
        }),
    )
}

pub(crate) enum StoredSearch {
    Text(SeriesSearch),
    Filter(SeriesFilter),
}

impl StoredSearch {
    pub(crate) fn parse(search: &LibrarySearch, now_ms: i64) -> Result<Self, omnileaf_db::Error> {
        let filter = search.filter.at(now_ms);
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
            Self::Filter(filter) => series_page(connection, &by_title(*filter), request),
        }
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
