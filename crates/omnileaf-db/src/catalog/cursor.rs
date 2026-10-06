use std::{fmt, str::FromStr};

use omnileaf_sync_proto::{BookId, SeriesId};

use crate::{Error, title_key::TitleStamp};

const TITLE_TAG: u8 = 1;
const ADDED_TAG: u8 = 2;
const BOOK_TAG: u8 = 3;
const ROOT_TAG: u8 = 4;
const ID_LENGTH: usize = 16;
const MILLIS_LENGTH: usize = size_of::<i64>();
const HEX_RADIX: u32 = 16;

/// Where the next page of a list starts, handed back unchanged by whoever asked for the previous page.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Cursor(pub(crate) Position);

/// The sort values of the last row on a page, which the next page starts after.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum Position {
    /// Carries the stamp its key was made under, since a key made under another compares differently.
    Title {
        stamp: TitleStamp,
        sort_key: Vec<u8>,
        id: SeriesId,
    },
    Added {
        added_at_ms: i64,
        id: SeriesId,
    },
    Book {
        series: SeriesId,
        sort_key: Vec<u8>,
        id: BookId,
    },
    Root {
        id: i64,
    },
}

impl Position {
    fn to_bytes(&self) -> Vec<u8> {
        match self {
            Self::Title {
                stamp,
                sort_key,
                id,
            } => [&[TITLE_TAG][..], id.as_bytes(), stamp.as_bytes(), sort_key].concat(),
            Self::Added { added_at_ms, id } => {
                [&[ADDED_TAG][..], &added_at_ms.to_be_bytes(), id.as_bytes()].concat()
            }
            Self::Book {
                series,
                sort_key,
                id,
            } => [&[BOOK_TAG][..], series.as_bytes(), id.as_bytes(), sort_key].concat(),
            Self::Root { id } => [&[ROOT_TAG][..], &id.to_be_bytes()].concat(),
        }
    }

    fn from_bytes(bytes: &[u8]) -> Option<Self> {
        let (&tag, rest) = bytes.split_first()?;
        match tag {
            TITLE_TAG => {
                let (id, rest) = rest.split_first_chunk::<ID_LENGTH>()?;
                let (stamp, sort_key) = rest.split_first_chunk::<{ TitleStamp::LENGTH }>()?;
                Some(Self::Title {
                    stamp: TitleStamp::from(*stamp),
                    sort_key: sort_key.to_vec(),
                    id: SeriesId::try_from(id.as_slice()).ok()?,
                })
            }
            ADDED_TAG => {
                let (added_at_ms, id) = rest.split_first_chunk::<MILLIS_LENGTH>()?;
                Some(Self::Added {
                    added_at_ms: i64::from_be_bytes(*added_at_ms),
                    id: SeriesId::try_from(id).ok()?,
                })
            }
            BOOK_TAG => {
                let (series, rest) = rest.split_first_chunk::<ID_LENGTH>()?;
                let (id, sort_key) = rest.split_first_chunk::<ID_LENGTH>()?;
                Some(Self::Book {
                    series: SeriesId::try_from(series.as_slice()).ok()?,
                    sort_key: sort_key.to_vec(),
                    id: BookId::try_from(id.as_slice()).ok()?,
                })
            }
            ROOT_TAG => Some(Self::Root {
                id: i64::from_be_bytes(rest.try_into().ok()?),
            }),
            _ => None,
        }
    }
}

impl fmt::Display for Cursor {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        self.0
            .to_bytes()
            .iter()
            .try_for_each(|byte| write!(formatter, "{byte:02x}"))
    }
}

impl FromStr for Cursor {
    type Err = Error;

    fn from_str(text: &str) -> Result<Self, Error> {
        hex_bytes(text)
            .and_then(|bytes| Position::from_bytes(&bytes))
            .map(Self)
            .ok_or(Error::MalformedCursor)
    }
}

fn hex_bytes(text: &str) -> Option<Vec<u8>> {
    let (pairs, remainder) = text.as_bytes().as_chunks::<2>();
    if !remainder.is_empty() {
        return None;
    }
    pairs
        .iter()
        .map(|&[high, low]| Some(hex_digit(high)? << 4 | hex_digit(low)?))
        .collect()
}

fn hex_digit(digit: u8) -> Option<u8> {
    char::from(digit)
        .to_digit(HEX_RADIX)
        .and_then(|value| u8::try_from(value).ok())
}
