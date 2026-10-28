#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum BookKind {
    Volume,
    Chapter,
    Special,
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
    pub(crate) const fn kind(&self) -> BookKind {
        match self {
            Self::Volume { .. } => BookKind::Volume,
            Self::Chapter { .. } => BookKind::Chapter,
            Self::Special { .. } => BookKind::Special,
        }
    }

    pub(crate) const fn number(&self) -> Option<Sourced<NumberRange>> {
        match *self {
            Self::Volume { numbers } => Some(numbers),
            Self::Chapter { number, .. } | Self::Special { number } => number,
        }
    }

    pub(crate) const fn volume(&self) -> Option<Sourced<BookNumber>> {
        match *self {
            Self::Chapter { volume, .. } => volume,
            Self::Volume { .. } | Self::Special { .. } => None,
        }
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
