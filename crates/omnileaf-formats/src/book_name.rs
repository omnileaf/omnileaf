use std::ops::RangeInclusive;

mod language;
mod markers;
mod number;
mod scan;
mod tags;
mod title;

pub use language::LanguageTag;
use markers::Markers;
pub use number::{Number, NumberRange};
use tags::tags;
use title::{Title, read_title};

const YEAR_DIGITS: usize = 4;
const SERIES_YEARS: RangeInclusive<u16> = 1900..=2099;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BookName {
    pub title: String,
    pub volume: Option<NumberRange>,
    pub chapter: Option<NumberRange>,
    pub language: Option<LanguageTag>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SeriesName {
    pub title: String,
    pub year: Option<u16>,
}

#[must_use]
pub fn read_book_name(name: &str, _series_title: Option<&str>) -> BookName {
    let title = read_title(name);
    let markers = match &title {
        Title::Text(text) => Markers::read(text),
        Title::OnlyTags(_) => Markers::default(),
    };
    BookName {
        title: title.into_string(),
        volume: markers.volume,
        chapter: markers.chapter,
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
