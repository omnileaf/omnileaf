mod language;
mod number;
mod tags;
mod title;

pub use language::LanguageTag;
pub use number::{Number, NumberRange};
use tags::tags;
use title::read_title;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BookName {
    pub title: String,
    pub language: Option<LanguageTag>,
}

#[must_use]
pub fn read_book_name(name: &str, _series_title: Option<&str>) -> BookName {
    BookName {
        title: read_title(name).into_string(),
        language: tags(name).find_map(LanguageTag::parse),
    }
}
