use std::{fmt, str::FromStr};

use omnileaf_sync_proto::{BookId, SeriesId};

use crate::{
    Error,
    catalog::{BookListing, BookNumber, BookSection, BooksShown, SortDirection},
    title_key::TitleStamp,
};

const TITLE_TAG: u8 = 1;
const ADDED_TAG: u8 = 2;
const BOOK_TAG: u8 = 3;
const ROOT_TAG: u8 = 4;
const DESCENDING_BIT: u8 = 0b01;
const UNREAD_BIT: u8 = 0b10;
const BOOKMARKED_BIT: u8 = 0b1_0000;
const VOLUME_BIT: u8 = 0b10_0000;
const VOLUME_LENGTH: usize = size_of::<u32>();
const SECTION_BITS: u8 = 0b1100;
const SECTION_SHIFT: u32 = 2;
const SESSION_TAG: u8 = 5;
const LAST_READ_TAG: u8 = 6;
const LAST_UPDATED_TAG: u8 = 7;
const UNREAD_COUNT_TAG: u8 = 8;
const TIME_LEFT_TAG: u8 = 9;
const WRITER_TAG: u8 = 10;
const FOLDER_GROUP_TAG: u8 = 11;
const CHAPTER_TAG: u8 = 12;
const ID_LENGTH: usize = 16;
const KEY_LENGTH_PREFIX: usize = size_of::<u32>();
const MILLIS_LENGTH: usize = size_of::<i64>();
const ROOT_ID_LENGTH: usize = size_of::<i64>();
const HEX_RADIX: u32 = 16;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Cursor(pub(crate) Position);

#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum Position {
    Title {
        stamp: TitleStamp,
        sort_key: Vec<u8>,
        id: SeriesId,
    },
    Added {
        added_at_ms: i64,
        id: SeriesId,
    },
    /// Carries the listing it was given out in, since a page in another order or of other books goes on from elsewhere.
    Book {
        series: SeriesId,
        listing: BookListing,
        sort_key: Vec<u8>,
        id: BookId,
    },
    Root {
        id: i64,
    },
    LastRead {
        last_read_at_ms: i64,
        id: SeriesId,
    },
    Session {
        started_at_ms: i64,
        id: i64,
    },
    LastUpdated {
        updated_at_ms: i64,
        id: SeriesId,
    },
    UnreadCount {
        unread_count: i64,
        id: SeriesId,
    },
    TimeLeft {
        time_left_key: i64,
        id: SeriesId,
    },
    Writer {
        stamp: TitleStamp,
        name_key: Vec<u8>,
        name: String,
    },
    FolderGroup {
        root: i64,
        location: Vec<u8>,
    },
    Chapter {
        index_id: i64,
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
                listing,
                sort_key,
                id,
            } => [
                &[BOOK_TAG][..],
                &listing_bytes(*listing),
                series.as_bytes(),
                id.as_bytes(),
                sort_key,
            ]
            .concat(),
            Self::Root { id } => [&[ROOT_TAG][..], &id.to_be_bytes()].concat(),
            Self::LastRead {
                last_read_at_ms,
                id,
            } => [
                &[LAST_READ_TAG][..],
                &last_read_at_ms.to_be_bytes(),
                id.as_bytes(),
            ]
            .concat(),
            Self::Session { started_at_ms, id } => [
                &[SESSION_TAG][..],
                &started_at_ms.to_be_bytes(),
                &id.to_be_bytes(),
            ]
            .concat(),
            Self::LastUpdated { updated_at_ms, id } => [
                &[LAST_UPDATED_TAG][..],
                &updated_at_ms.to_be_bytes(),
                id.as_bytes(),
            ]
            .concat(),
            Self::UnreadCount { unread_count, id } => [
                &[UNREAD_COUNT_TAG][..],
                &unread_count.to_be_bytes(),
                id.as_bytes(),
            ]
            .concat(),
            Self::TimeLeft { time_left_key, id } => [
                &[TIME_LEFT_TAG][..],
                &time_left_key.to_be_bytes(),
                id.as_bytes(),
            ]
            .concat(),
            Self::Writer {
                stamp,
                name_key,
                name,
            } => [
                &[WRITER_TAG][..],
                stamp.as_bytes(),
                &saturating_u32(name_key.len()).to_be_bytes(),
                name_key,
                name.as_bytes(),
            ]
            .concat(),
            Self::FolderGroup { root, location } => {
                [&[FOLDER_GROUP_TAG][..], &root.to_be_bytes(), location].concat()
            }
            Self::Chapter { index_id } => [&[CHAPTER_TAG][..], &index_id.to_be_bytes()].concat(),
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
                let (listing, rest) = listing_from_bytes(rest)?;
                let (series, rest) = rest.split_first_chunk::<ID_LENGTH>()?;
                let (id, sort_key) = rest.split_first_chunk::<ID_LENGTH>()?;
                Some(Self::Book {
                    series: SeriesId::try_from(series.as_slice()).ok()?,
                    listing,
                    sort_key: sort_key.to_vec(),
                    id: BookId::try_from(id.as_slice()).ok()?,
                })
            }
            LAST_READ_TAG => {
                let (last_read_at_ms, id) = rest.split_first_chunk::<MILLIS_LENGTH>()?;
                Some(Self::LastRead {
                    last_read_at_ms: i64::from_be_bytes(*last_read_at_ms),
                    id: SeriesId::try_from(id).ok()?,
                })
            }
            ROOT_TAG => Some(Self::Root {
                id: i64::from_be_bytes(rest.try_into().ok()?),
            }),
            SESSION_TAG => {
                let (started_at_ms, id) = rest.split_first_chunk::<MILLIS_LENGTH>()?;
                Some(Self::Session {
                    started_at_ms: i64::from_be_bytes(*started_at_ms),
                    id: i64::from_be_bytes(id.try_into().ok()?),
                })
            }
            LAST_UPDATED_TAG => {
                let (updated_at_ms, id) = rest.split_first_chunk::<MILLIS_LENGTH>()?;
                Some(Self::LastUpdated {
                    updated_at_ms: i64::from_be_bytes(*updated_at_ms),
                    id: SeriesId::try_from(id).ok()?,
                })
            }
            UNREAD_COUNT_TAG => {
                let (unread_count, id) = rest.split_first_chunk::<MILLIS_LENGTH>()?;
                Some(Self::UnreadCount {
                    unread_count: i64::from_be_bytes(*unread_count),
                    id: SeriesId::try_from(id).ok()?,
                })
            }
            TIME_LEFT_TAG => {
                let (time_left_key, id) = rest.split_first_chunk::<MILLIS_LENGTH>()?;
                Some(Self::TimeLeft {
                    time_left_key: i64::from_be_bytes(*time_left_key),
                    id: SeriesId::try_from(id).ok()?,
                })
            }
            WRITER_TAG => {
                let (stamp, rest) = rest.split_first_chunk::<{ TitleStamp::LENGTH }>()?;
                let (key_length, rest) = rest.split_first_chunk::<KEY_LENGTH_PREFIX>()?;
                let key_length = usize::try_from(u32::from_be_bytes(*key_length)).ok()?;
                let (name_key, name) = rest.split_at_checked(key_length)?;
                Some(Self::Writer {
                    stamp: TitleStamp::from(*stamp),
                    name_key: name_key.to_vec(),
                    name: String::from_utf8(name.to_vec()).ok()?,
                })
            }
            FOLDER_GROUP_TAG => {
                let (root, location) = rest.split_first_chunk::<ROOT_ID_LENGTH>()?;
                Some(Self::FolderGroup {
                    root: i64::from_be_bytes(*root),
                    location: location.to_vec(),
                })
            }
            CHAPTER_TAG => Some(Self::Chapter {
                index_id: i64::from_be_bytes(rest.try_into().ok()?),
            }),
            _ => None,
        }
    }
}

fn saturating_u32(length: usize) -> u32 {
    u32::try_from(length).unwrap_or(u32::MAX)
}

fn listing_bytes(listing: BookListing) -> Vec<u8> {
    let volume = listing.volume.map_or_else(Vec::new, |volume| {
        volume.thousandths().to_be_bytes().to_vec()
    });
    [&[listing_byte(listing)][..], &volume].concat()
}

fn listing_from_bytes(bytes: &[u8]) -> Option<(BookListing, &[u8])> {
    let (&byte, rest) = bytes.split_first()?;
    let (volume, rest) = if byte & VOLUME_BIT == 0 {
        (None, rest)
    } else {
        let (volume, rest) = rest.split_first_chunk::<VOLUME_LENGTH>()?;
        (
            Some(BookNumber::from_thousandths(u32::from_be_bytes(*volume))),
            rest,
        )
    };
    let listing = listing_from_byte(byte & !VOLUME_BIT)?;
    Some((BookListing { volume, ..listing }, rest))
}

fn listing_byte(listing: BookListing) -> u8 {
    let direction = match listing.direction {
        SortDirection::Ascending => 0,
        SortDirection::Descending => DESCENDING_BIT,
    };
    let shown = match listing.shown {
        BooksShown::All => 0,
        BooksShown::Unread => UNREAD_BIT,
        BooksShown::Bookmarked => BOOKMARKED_BIT,
    };
    let volume = if listing.volume.is_some() {
        VOLUME_BIT
    } else {
        0
    };
    direction | shown | volume | section_code(listing.section) << SECTION_SHIFT
}

fn section_code(section: Option<BookSection>) -> u8 {
    match section {
        None => 0,
        Some(BookSection::Volumes) => 1,
        Some(BookSection::Chapters) => 2,
        Some(BookSection::Specials) => 3,
    }
}

fn listing_from_byte(byte: u8) -> Option<BookListing> {
    if byte & !(DESCENDING_BIT | UNREAD_BIT | BOOKMARKED_BIT | SECTION_BITS) != 0 {
        return None;
    }
    let section = match (byte & SECTION_BITS) >> SECTION_SHIFT {
        0 => None,
        1 => Some(BookSection::Volumes),
        2 => Some(BookSection::Chapters),
        3 => Some(BookSection::Specials),
        _ => return None,
    };
    Some(BookListing {
        shown: match (byte & UNREAD_BIT != 0, byte & BOOKMARKED_BIT != 0) {
            (false, false) => BooksShown::All,
            (true, false) => BooksShown::Unread,
            (false, true) => BooksShown::Bookmarked,
            (true, true) => return None,
        },
        direction: if byte & DESCENDING_BIT == 0 {
            SortDirection::Ascending
        } else {
            SortDirection::Descending
        },
        section,
        volume: None,
    })
}

impl fmt::Display for Cursor {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write_hex(&self.0.to_bytes(), formatter)
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

pub(crate) fn write_hex(bytes: &[u8], formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
    bytes
        .iter()
        .try_for_each(|byte| write!(formatter, "{byte:02x}"))
}

pub(crate) fn hex_bytes(text: &str) -> Option<Vec<u8>> {
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

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use super::*;

    const EVERY_SECTION: [Option<BookSection>; 4] = [
        None,
        Some(BookSection::Volumes),
        Some(BookSection::Chapters),
        Some(BookSection::Specials),
    ];

    fn every_listing() -> Vec<BookListing> {
        EVERY_SECTION
            .into_iter()
            .flat_map(|section| {
                [BooksShown::All, BooksShown::Unread, BooksShown::Bookmarked]
                    .into_iter()
                    .flat_map(move |shown| {
                        [SortDirection::Ascending, SortDirection::Descending]
                            .into_iter()
                            .map(move |direction| BookListing {
                                shown,
                                direction,
                                section,
                                volume: None,
                            })
                    })
            })
            .collect()
    }

    #[test]
    fn reads_back_every_book_listing_from_its_own_byte() {
        for listing in every_listing() {
            assert_eq!(listing_from_byte(listing_byte(listing)), Some(listing));
        }
    }

    #[test]
    fn reads_back_the_volume_a_book_listing_is_narrowed_to_and_the_bytes_after_it() {
        let listing = BookListing {
            volume: Some(BookNumber::from_thousandths(12_500)),
            ..BookListing::IN_ORDER
        };
        let bytes = [listing_bytes(listing), vec![7, 8]].concat();

        let read = listing_from_bytes(&bytes);

        assert_eq!(read, Some((listing, &[7, 8][..])));
    }

    #[test]
    fn gives_every_book_listing_a_byte_of_its_own() {
        let listings = every_listing();

        let bytes: HashSet<u8> = listings.iter().copied().map(listing_byte).collect();

        assert_eq!(bytes.len(), listings.len());
    }

    #[test]
    fn reads_back_the_index_row_a_chapter_cursor_stands_at() {
        for index_id in [0, 1, 2_000, i64::MAX] {
            let cursor = Cursor(Position::Chapter { index_id });

            let read: Cursor = cursor.to_string().parse().unwrap();

            assert_eq!(read, cursor);
        }
    }

    #[test]
    fn refuses_a_chapter_cursor_cut_short_or_run_long() {
        let whole = Cursor(Position::Chapter { index_id: 2_000 }).to_string();
        let cut_short = &whole[..whole.len() - 2];
        let run_long = format!("{whole}00");

        let refused = [cut_short.parse::<Cursor>(), run_long.parse::<Cursor>()];

        assert!(
            refused
                .iter()
                .all(|read| matches!(read, Err(Error::MalformedCursor)))
        );
    }
}
