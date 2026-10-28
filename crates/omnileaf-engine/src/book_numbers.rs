use omnileaf_db::catalog;
use serde::{Deserialize, Serialize};
use specta::{Type, Types, datatype::DataType};

const THOUSANDTHS_PER_ONE: f64 = 1000.0;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum BookKind {
    Volume,
    Chapter,
    Special,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum BookSection {
    Volumes,
    Chapters,
    Specials,
}

/// Crosses as its decimal value, so 12.5 is `12.5`, while held in thousandths so it compares exactly.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(into = "f64")]
pub struct BookNumber(pub(crate) u32);

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct NumberRange {
    pub first: BookNumber,
    pub last: BookNumber,
}

impl BookSection {
    pub(crate) const fn in_catalog(self) -> catalog::BookSection {
        match self {
            Self::Volumes => catalog::BookSection::Volumes,
            Self::Chapters => catalog::BookSection::Chapters,
            Self::Specials => catalog::BookSection::Specials,
        }
    }
}

impl From<catalog::BookSection> for BookSection {
    fn from(section: catalog::BookSection) -> Self {
        match section {
            catalog::BookSection::Volumes => Self::Volumes,
            catalog::BookSection::Chapters => Self::Chapters,
            catalog::BookSection::Specials => Self::Specials,
        }
    }
}

impl From<catalog::BookKind> for BookKind {
    fn from(kind: catalog::BookKind) -> Self {
        match kind {
            catalog::BookKind::Volume => Self::Volume,
            catalog::BookKind::Chapter => Self::Chapter,
            catalog::BookKind::Special => Self::Special,
        }
    }
}

impl From<catalog::BookNumber> for BookNumber {
    fn from(number: catalog::BookNumber) -> Self {
        Self(number.thousandths())
    }
}

impl From<catalog::NumberRange> for NumberRange {
    fn from(range: catalog::NumberRange) -> Self {
        Self {
            first: range.first().into(),
            last: range.last().into(),
        }
    }
}

impl From<BookNumber> for f64 {
    fn from(number: BookNumber) -> Self {
        Self::from(number.0) / THOUSANDTHS_PER_ONE
    }
}

/// Described as an integer since specta types every float as `number | null`, though a book number is never NaN.
impl Type for BookNumber {
    fn definition(types: &mut Types) -> DataType {
        u32::definition(types)
    }
}
