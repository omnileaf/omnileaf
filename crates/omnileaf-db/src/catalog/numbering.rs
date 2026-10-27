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
