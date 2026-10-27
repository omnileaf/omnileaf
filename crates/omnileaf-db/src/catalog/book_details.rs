use omnileaf_sync_proto::BookId;
use rusqlite::{Statement, Transaction};

use crate::Error;

const RECORD_DETAILS: &str = "INSERT INTO book_details (
        book_id, series, number, title, volume, summary, publisher, format, language,
        reading_direction, age_rating, year
    )
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
    ON CONFLICT (book_id) DO UPDATE SET
        series = excluded.series,
        number = excluded.number,
        title = excluded.title,
        volume = excluded.volume,
        summary = excluded.summary,
        publisher = excluded.publisher,
        format = excluded.format,
        language = excluded.language,
        reading_direction = excluded.reading_direction,
        age_rating = excluded.age_rating,
        year = excluded.year
    WHERE (series, number, title, volume, summary, publisher, format, language,
            reading_direction, age_rating, year)
        IS NOT (excluded.series, excluded.number, excluded.title, excluded.volume,
            excluded.summary, excluded.publisher, excluded.format, excluded.language,
            excluded.reading_direction, excluded.age_rating, excluded.year)";

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct BookDetails {
    pub series: Option<String>,
    pub number: Option<String>,
    pub title: Option<String>,
    pub volume: Option<u32>,
    pub summary: Option<String>,
    pub publisher: Option<String>,
    pub format: Option<String>,
    pub language: Option<String>,
    pub reading_direction: Option<ReadingDirection>,
    pub age_rating: Option<AgeRating>,
    pub year: Option<u16>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ReadingDirection {
    LeftToRight,
    RightToLeft,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AgeRating {
    EarlyChildhood,
    Everyone,
    Everyone10,
    G,
    KidsToAdults,
    Pg,
    Teen,
    Ma15,
    Mature17,
    M,
    AdultsOnly18,
    R18,
    X18,
}

pub(crate) struct DetailsRecorder<'t> {
    details: Statement<'t>,
}

impl<'t> DetailsRecorder<'t> {
    pub(crate) fn new(transaction: &'t Transaction<'_>) -> Result<Self, Error> {
        Ok(Self {
            details: transaction.prepare(RECORD_DETAILS)?,
        })
    }

    pub(crate) fn record(&mut self, book: BookId, details: &BookDetails) -> Result<(), Error> {
        self.details.execute((
            book.as_bytes(),
            &details.series,
            &details.number,
            &details.title,
            details.volume,
            &details.summary,
            &details.publisher,
            &details.format,
            &details.language,
            details.reading_direction.map(ReadingDirection::as_stored),
            details.age_rating.map(AgeRating::as_stored),
            details.year,
        ))?;
        Ok(())
    }
}

impl ReadingDirection {
    const fn as_stored(self) -> &'static str {
        match self {
            Self::LeftToRight => "left_to_right",
            Self::RightToLeft => "right_to_left",
        }
    }
}

impl AgeRating {
    const fn as_stored(self) -> &'static str {
        match self {
            Self::EarlyChildhood => "early_childhood",
            Self::Everyone => "everyone",
            Self::Everyone10 => "everyone_10",
            Self::G => "g",
            Self::KidsToAdults => "kids_to_adults",
            Self::Pg => "pg",
            Self::Teen => "teen",
            Self::Ma15 => "ma_15",
            Self::Mature17 => "mature_17",
            Self::M => "m",
            Self::AdultsOnly18 => "adults_only_18",
            Self::R18 => "r_18",
            Self::X18 => "x_18",
        }
    }
}
