use rusqlite::Connection;

use crate::{Error, adult_content::AdultHiding};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ChapterSuggestion {
    pub chapter_words: String,
    pub series_title: String,
}

#[tracing::instrument(skip_all)]
pub fn closest_chapter_title(
    _connection: &Connection,
    _text: &str,
    _hiding: AdultHiding,
) -> Result<Option<ChapterSuggestion>, Error> {
    Ok(None)
}
