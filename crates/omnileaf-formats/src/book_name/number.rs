use std::fmt;

use super::scan::skip_spaces;

const THOUSANDTHS_PER_UNIT: u32 = 1_000;
const FRACTION_DIGITS: usize = 3;
const RADIX: u32 = 10;
const DECIMAL_POINT: u8 = b'.';
const RANGE_DASHES: [&str; 3] = ["-", "\u{2013}", "~"];

#[derive(Debug, Clone, Copy)]
pub(super) struct Found<T> {
    pub(super) value: T,
    pub(super) end: usize,
}

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

    pub(super) fn read(text: &str, start: usize) -> Option<Found<Self>> {
        let bytes = text.as_bytes();
        let mut end = start;
        let mut whole: u32 = 0;
        while let Some(digit) = digit_at(bytes, end) {
            whole = whole.saturating_mul(RADIX).saturating_add(digit);
            end += 1;
        }
        if end == start {
            return None;
        }
        let mut fraction = 0;
        if bytes.get(end) == Some(&DECIMAL_POINT) && digit_at(bytes, end + 1).is_some() {
            end += 1;
            let mut place = THOUSANDTHS_PER_UNIT;
            while let Some(digit) = digit_at(bytes, end) {
                place /= RADIX;
                fraction += digit * place;
                end += 1;
            }
        }
        let thousandths = whole
            .saturating_mul(THOUSANDTHS_PER_UNIT)
            .saturating_add(fraction);
        Some(Found {
            value: Self(thousandths),
            end,
        })
    }
}

fn digit_at(bytes: &[u8], at: usize) -> Option<u32> {
    bytes
        .get(at)
        .and_then(|byte| char::from(*byte).to_digit(RADIX))
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

    pub(super) fn read_after(
        text: &str,
        first: Found<Number>,
        read_last: impl FnOnce(usize) -> Option<Found<Number>>,
    ) -> Found<Self> {
        let single = Found {
            value: Self::from(first.value),
            end: first.end,
        };
        let Some(after_dash) = dash_end(text, skip_spaces(text, first.end)) else {
            return single;
        };
        read_last(skip_spaces(text, after_dash))
            .and_then(|last| {
                Some(Found {
                    value: Self::new(first.value, last.value)?,
                    end: last.end,
                })
            })
            .unwrap_or(single)
    }
}

fn dash_end(text: &str, at: usize) -> Option<usize> {
    let rest = text.get(at..)?;
    RANGE_DASHES
        .iter()
        .find(|dash| rest.starts_with(**dash))
        .map(|dash| at + dash.len())
}

impl From<Number> for NumberRange {
    fn from(number: Number) -> Self {
        Self {
            first: number,
            last: number,
        }
    }
}
