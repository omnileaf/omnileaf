use omnileaf_db::{
    Connection,
    catalog::{
        Page, PageRequest, SearchText, SeriesFilter, SeriesListing, SeriesOrder, SeriesSearch,
        SeriesSort, SeriesSummary, search_count, search_page, series_count, series_page,
    },
};
use serde::{Deserialize, Serialize};
use specta::Type;

use crate::LibraryFilter;

/// What someone typed to find series by title, and the filter the series found must also pass.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LibrarySearch {
    /// Text of nothing but white space finds every series the filter lets through.
    pub text: String,
    pub filter: LibraryFilter,
}

/// A search read for the database: by its text, or by its filter alone when it has none.
pub(crate) enum StoredSearch {
    Text(SeriesSearch),
    Filter(SeriesFilter),
}

impl StoredSearch {
    pub(crate) fn parse(search: &LibrarySearch) -> Result<Self, omnileaf_db::Error> {
        let filter = SeriesFilter::from(search.filter);
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
