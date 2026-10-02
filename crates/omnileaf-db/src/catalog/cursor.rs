use std::{fmt, str::FromStr};

use omnileaf_sync_proto::BookId;

use crate::Error;

const TITLE_TAG: u8 = 1;
const ADDED_TAG: u8 = 2;
const BOOK_TAG: u8 = 3;
const ID_LENGTH: usize = 16;
const ROW_KEY_LENGTH: usize = 8;
const HEX_RADIX: u32 = 16;

/// Where the next page of a list starts, handed back unchanged by whoever asked for the previous page.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Cursor(pub(crate) Position);

/// The sort values of the last row on a page, which the next page starts after.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum Position {
    Title { sort_key: Vec<u8>, local_id: i64 },
    Added { added_at_ms: i64, local_id: i64 },
    Book { sort_key: Vec<u8>, id: BookId },
}

impl Position {
    fn to_bytes(&self) -> Vec<u8> {
        match self {
            Self::Title { sort_key, local_id } => {
                [&[TITLE_TAG][..], &local_id.to_be_bytes(), sort_key].concat()
            }
            Self::Added {
                added_at_ms,
                local_id,
            } => [
                &[ADDED_TAG][..],
                &added_at_ms.to_be_bytes(),
                &local_id.to_be_bytes(),
            ]
            .concat(),
            Self::Book { sort_key, id } => [&[BOOK_TAG][..], id.as_bytes(), sort_key].concat(),
        }
    }

    fn from_bytes(bytes: &[u8]) -> Option<Self> {
        let (&tag, rest) = bytes.split_first()?;
        match tag {
            TITLE_TAG => {
                let (local_id, sort_key) = rest.split_first_chunk::<ROW_KEY_LENGTH>()?;
                Some(Self::Title {
                    sort_key: sort_key.to_vec(),
                    local_id: i64::from_be_bytes(*local_id),
                })
            }
            ADDED_TAG => {
                let (added_at_ms, local_id) = rest.split_first_chunk::<ROW_KEY_LENGTH>()?;
                Some(Self::Added {
                    added_at_ms: i64::from_be_bytes(*added_at_ms),
                    local_id: i64::from_be_bytes(local_id.try_into().ok()?),
                })
            }
            BOOK_TAG => {
                let (id, sort_key) = rest.split_first_chunk::<ID_LENGTH>()?;
                Some(Self::Book {
                    sort_key: sort_key.to_vec(),
                    id: BookId::try_from(id.as_slice()).ok()?,
                })
            }
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
