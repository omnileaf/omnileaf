use std::path::Path;

use omnileaf_db::catalog::{AgeRating, BookDetails, ReadingDirection};
use omnileaf_formats::{self as formats, Book, ComicInfo};

use crate::error_chain::describe_error;

pub(crate) fn read_details(book: &mut Book, file: &Path) -> BookDetails {
    let comic_info = book.comic_info().unwrap_or_else(|error| {
        tracing::warn!(
            file = %file.display(),
            error = %describe_error(&error),
            "keep no details for a book whose ComicInfo can't be read"
        );
        None
    });
    comic_info.map(details_of).unwrap_or_default()
}

fn details_of(info: ComicInfo) -> BookDetails {
    BookDetails {
        series: info.series,
        number: info.number,
        title: info.title,
        volume: info.volume,
        summary: info.summary,
        publisher: info.publisher,
        format: info.format,
        language: info.language,
        reading_direction: info.reading_direction.map(stored_direction),
        age_rating: info.age_rating.map(stored_rating),
        year: info.year,
    }
}

const fn stored_direction(direction: formats::ReadingDirection) -> ReadingDirection {
    match direction {
        formats::ReadingDirection::LeftToRight => ReadingDirection::LeftToRight,
        formats::ReadingDirection::RightToLeft => ReadingDirection::RightToLeft,
    }
}

const fn stored_rating(rating: formats::AgeRating) -> AgeRating {
    match rating {
        formats::AgeRating::EarlyChildhood => AgeRating::EarlyChildhood,
        formats::AgeRating::Everyone => AgeRating::Everyone,
        formats::AgeRating::Everyone10 => AgeRating::Everyone10,
        formats::AgeRating::G => AgeRating::G,
        formats::AgeRating::KidsToAdults => AgeRating::KidsToAdults,
        formats::AgeRating::Pg => AgeRating::Pg,
        formats::AgeRating::Teen => AgeRating::Teen,
        formats::AgeRating::Ma15 => AgeRating::Ma15,
        formats::AgeRating::Mature17 => AgeRating::Mature17,
        formats::AgeRating::M => AgeRating::M,
        formats::AgeRating::AdultsOnly18 => AgeRating::AdultsOnly18,
        formats::AgeRating::R18 => AgeRating::R18,
        formats::AgeRating::X18 => AgeRating::X18,
    }
}
