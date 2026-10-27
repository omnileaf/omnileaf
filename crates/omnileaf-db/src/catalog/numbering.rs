use rusqlite::{
    Row,
    types::{FromSql, FromSqlError, FromSqlResult, Type, ValueRef},
};

const FIRST_NUMBER_COLUMN: &str = "first_number";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum BookKind {
    Volume,
    Chapter,
    Special,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum BookSection {
    Volumes,
    Chapters,
    Specials,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct BookNumber(u32);

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct NumberRange {
    first: BookNumber,
    last: BookNumber,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum ValueSource {
    FolderName,
    FileName,
    Files,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct Sourced<T> {
    pub value: T,
    pub source: ValueSource,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Numbering {
    Volume {
        numbers: Sourced<NumberRange>,
    },
    Chapter {
        number: Option<Sourced<NumberRange>>,
        volume: Option<Sourced<BookNumber>>,
    },
    Special {
        number: Option<Sourced<NumberRange>>,
    },
}

impl BookKind {
    pub(crate) const fn as_stored(self) -> &'static str {
        match self {
            Self::Volume => "volume",
            Self::Chapter => "chapter",
            Self::Special => "special",
        }
    }
}

impl BookNumber {
    #[must_use]
    pub const fn from_thousandths(thousandths: u32) -> Self {
        Self(thousandths)
    }

    #[must_use]
    pub const fn thousandths(self) -> u32 {
        self.0
    }
}

impl NumberRange {
    #[must_use]
    pub const fn single(number: BookNumber) -> Self {
        Self {
            first: number,
            last: number,
        }
    }

    #[must_use]
    pub fn new(first: BookNumber, last: BookNumber) -> Option<Self> {
        (first <= last).then_some(Self { first, last })
    }

    #[must_use]
    pub const fn first(self) -> BookNumber {
        self.first
    }

    #[must_use]
    pub const fn last(self) -> BookNumber {
        self.last
    }
}

impl ValueSource {
    pub(crate) const fn as_stored(self) -> &'static str {
        match self {
            Self::FolderName => "folder_name",
            Self::FileName => "file_name",
            Self::Files => "files",
        }
    }
}

impl Numbering {
    #[must_use]
    pub const fn kind(&self) -> BookKind {
        match self {
            Self::Volume { .. } => BookKind::Volume,
            Self::Chapter { .. } => BookKind::Chapter,
            Self::Special { .. } => BookKind::Special,
        }
    }

    #[must_use]
    pub const fn section(&self) -> BookSection {
        match self {
            Self::Volume { .. }
            | Self::Chapter {
                volume: Some(_), ..
            } => BookSection::Volumes,
            Self::Chapter { volume: None, .. } => BookSection::Chapters,
            Self::Special { .. } => BookSection::Specials,
        }
    }

    #[must_use]
    pub const fn number(&self) -> Option<Sourced<NumberRange>> {
        match *self {
            Self::Volume { numbers } => Some(numbers),
            Self::Chapter { number, .. } | Self::Special { number } => number,
        }
    }

    #[must_use]
    pub const fn volume(&self) -> Option<Sourced<BookNumber>> {
        match *self {
            Self::Chapter { volume, .. } => volume,
            Self::Volume { .. } | Self::Special { .. } => None,
        }
    }
}

/// Reads the `kind`, `first_number`, `last_number`, `number_source`, `volume_number` and `volume_source` columns, which a book not placed yet leaves null.
pub(crate) fn stored_numbering(row: &Row<'_>) -> rusqlite::Result<Option<Numbering>> {
    let Some(kind) = row.get("kind")? else {
        return Ok(None);
    };
    let number = stored_numbers(row)?;
    Ok(Some(match kind {
        BookKind::Volume => Numbering::Volume {
            numbers: number.ok_or_else(|| unnumbered_volume(row))?,
        },
        BookKind::Chapter => Numbering::Chapter {
            number,
            volume: stored_volume(row)?,
        },
        BookKind::Special => Numbering::Special { number },
    }))
}

fn unnumbered_volume(row: &Row<'_>) -> rusqlite::Error {
    let column = FIRST_NUMBER_COLUMN.to_owned();
    match row.as_ref().column_index(&column) {
        Ok(index) => rusqlite::Error::InvalidColumnType(index, column, Type::Null),
        Err(error) => error,
    }
}

fn stored_numbers(row: &Row<'_>) -> rusqlite::Result<Option<Sourced<NumberRange>>> {
    let first: Option<BookNumber> = row.get(FIRST_NUMBER_COLUMN)?;
    let last: Option<BookNumber> = row.get("last_number")?;
    let source: Option<ValueSource> = row.get("number_source")?;
    Ok(first
        .zip(last)
        .and_then(|(first, last)| NumberRange::new(first, last))
        .zip(source)
        .map(|(value, source)| Sourced { value, source }))
}

fn stored_volume(row: &Row<'_>) -> rusqlite::Result<Option<Sourced<BookNumber>>> {
    let volume: Option<BookNumber> = row.get("volume_number")?;
    let source: Option<ValueSource> = row.get("volume_source")?;
    Ok(volume
        .zip(source)
        .map(|(value, source)| Sourced { value, source }))
}

impl FromSql for BookKind {
    fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
        let stored = value.as_str()?;
        [Self::Volume, Self::Chapter, Self::Special]
            .into_iter()
            .find(|kind| kind.as_stored() == stored)
            .ok_or(FromSqlError::InvalidType)
    }
}

impl FromSql for ValueSource {
    fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
        let stored = value.as_str()?;
        [Self::FolderName, Self::FileName, Self::Files]
            .into_iter()
            .find(|source| source.as_stored() == stored)
            .ok_or(FromSqlError::InvalidType)
    }
}

impl FromSql for BookNumber {
    fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
        let thousandths = value.as_i64()?;
        u32::try_from(thousandths)
            .map(Self)
            .map_err(|_| FromSqlError::OutOfRange(thousandths))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spans_a_range_from_its_first_number_to_its_last() {
        let first = BookNumber::from_thousandths(1000);
        let last = BookNumber::from_thousandths(3000);

        let range = NumberRange::new(first, last);

        assert_eq!(
            range.map(|range| (range.first(), range.last())),
            Some((first, last))
        );
    }

    #[test]
    fn refuses_a_range_whose_last_number_is_below_its_first() {
        let first = BookNumber::from_thousandths(3000);
        let last = BookNumber::from_thousandths(1000);

        let range = NumberRange::new(first, last);

        assert_eq!(range, None);
    }
}
