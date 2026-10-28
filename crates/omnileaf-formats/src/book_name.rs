use std::ops::RangeInclusive;

mod bare_number;
mod language;
mod markers;
mod number;
mod scan;
mod tags;
mod title;

use bare_number::{end_of_series_title, read_bare_number, read_bare_number_from};
pub use language::LanguageTag;
use markers::{Markers, read_only_volume_markers};
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
    pub number: Option<NumberRange>,
    pub number_after_volume: Option<NumberRange>,
    pub language: Option<LanguageTag>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SeriesName {
    pub title: String,
    pub year: Option<u16>,
}

#[must_use]
pub fn read_book_name(name: &str, series_title: Option<&str>) -> BookName {
    let title = read_title(name);
    let numbers = match &title {
        Title::Text(text) => Numbers::read(text, series_title),
        Title::OnlyTags(_) => Numbers::default(),
    };
    BookName {
        title: title.into_string(),
        volume: numbers.volume,
        chapter: numbers.chapter,
        number: numbers.number,
        number_after_volume: numbers.number_after_volume,
        language: tags(name).find_map(LanguageTag::parse),
    }
}

#[derive(Debug, Default)]
struct Numbers {
    volume: Option<NumberRange>,
    chapter: Option<NumberRange>,
    number: Option<NumberRange>,
    number_after_volume: Option<NumberRange>,
}

impl Numbers {
    fn read(title: &str, series_title: Option<&str>) -> Self {
        let Markers { volume, chapter } = Markers::read(title);
        let has_marker = volume.is_some() || chapter.is_some();
        Self {
            volume: volume.map(|volume| volume.value),
            chapter: chapter.map(|chapter| chapter.value),
            number: if has_marker {
                None
            } else {
                read_bare_number(title, series_title)
            },
            number_after_volume: volume.and_then(|volume| read_bare_number_from(title, volume.end)),
        }
    }
}

#[must_use]
pub fn read_volume_folder_name(name: &str, series_title: &str) -> Option<NumberRange> {
    let Title::Text(title) = read_title(name) else {
        return None;
    };
    end_of_series_title(&title, series_title)
        .and_then(|end| title.get(end..))
        .and_then(read_only_volume_markers)
        .or_else(|| read_only_volume_markers(&title))
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
