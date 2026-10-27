use std::ops::RangeInclusive;

mod language;
mod number;
mod tags;
mod title;

pub use language::LanguageTag;
pub use number::{Number, NumberRange};
use tags::tags;
use title::read_title;

const YEAR_DIGITS: usize = 4;
const SERIES_YEARS: RangeInclusive<u16> = 1900..=2099;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BookName {
    pub title: String,
    pub language: Option<LanguageTag>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SeriesName {
    pub title: String,
    pub year: Option<u16>,
}

#[must_use]
pub fn read_book_name(name: &str, _series_title: Option<&str>) -> BookName {
    BookName {
        title: read_title(name).into_string(),
        language: tags(name).find_map(LanguageTag::parse),
    }
}

#[must_use]
pub fn read_series_name(name: &str) -> SeriesName {
    SeriesName {
        title: read_title(name).into_string(),
        year: tags(name).find_map(read_year),
    }
}

fn read_year(tag: &str) -> Option<u16> {
    if tag.len() != YEAR_DIGITS || !tag.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    tag.parse().ok().filter(|year| SERIES_YEARS.contains(year))
}
