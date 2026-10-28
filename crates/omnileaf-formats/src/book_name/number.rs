use std::fmt;

const THOUSANDTHS_PER_UNIT: u32 = 1_000;
const FRACTION_DIGITS: usize = 3;
const RADIX: u32 = 10;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Number(u32);

impl Number {
    #[must_use]
    pub const fn from_thousandths(thousandths: u32) -> Self {
        Self(thousandths)
    }

    #[must_use]
    pub const fn thousandths(self) -> u32 {
        self.0
    }
}

impl fmt::Display for Number {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        let whole = self.0 / THOUSANDTHS_PER_UNIT;
        let mut fraction = self.0 % THOUSANDTHS_PER_UNIT;
        write!(formatter, "{whole}")?;
        if fraction == 0 {
            return Ok(());
        }
        let mut width = FRACTION_DIGITS;
        while fraction.is_multiple_of(RADIX) {
            fraction /= RADIX;
            width -= 1;
        }
        write!(formatter, ".{fraction:0width$}")
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct NumberRange {
    first: Number,
    last: Number,
}

impl NumberRange {
    #[must_use]
    pub fn new(first: Number, last: Number) -> Option<Self> {
        (first <= last).then_some(Self { first, last })
    }

    #[must_use]
    pub const fn first(self) -> Number {
        self.first
    }

    #[must_use]
    pub const fn last(self) -> Number {
        self.last
    }
}

impl From<Number> for NumberRange {
    fn from(number: Number) -> Self {
        Self {
            first: number,
            last: number,
        }
    }
}
