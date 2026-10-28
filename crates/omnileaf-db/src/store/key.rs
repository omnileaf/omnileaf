use omnileaf_sync_proto::{BookId, BookmarkId, IdError, ProfileId};

const BOOK: &str = "book";
const POSITION: &str = "pos";
const READ: &str = "read";
const FURTHEST: &str = "max";
const BOOKMARK: &str = "bookmark";
const BOOK_HIGH: &str = "book_hi";
const BOOK_LOW: &str = "book_lo";
const PAGE: &str = "page";
const DELETED: &str = "deleted";

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum LatestKey {
    BookPosition(BookId),
    BookRead(BookId),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum MaximumKey {
    BookFurthest(BookId),
}

/// The halves of a bookmarked book's id and the page are kept beside the flag because a bookmark's id is derived from both and cannot be read back into them.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum BookmarkKey {
    BookHigh(BookmarkId),
    BookLow(BookmarkId),
    Page(BookmarkId),
    Deleted(BookmarkId),
}

impl BookmarkKey {
    #[must_use]
    pub const fn id(self) -> BookmarkId {
        match self {
            Self::BookHigh(id) | Self::BookLow(id) | Self::Page(id) | Self::Deleted(id) => id,
        }
    }

    const fn address(self, profile: ProfileId) -> Address {
        let field = match self {
            Self::BookHigh(_) => BOOK_HIGH,
            Self::BookLow(_) => BOOK_LOW,
            Self::Page(_) => PAGE,
            Self::Deleted(_) => DELETED,
        };
        Address {
            profile,
            entity: BOOKMARK,
            id: *self.id().as_bytes(),
            field,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Key {
    Latest(LatestKey),
    Maximum(MaximumKey),
    Bookmark(BookmarkKey),
}

impl From<BookmarkKey> for Key {
    fn from(key: BookmarkKey) -> Self {
        Self::Bookmark(key)
    }
}

impl From<LatestKey> for Key {
    fn from(key: LatestKey) -> Self {
        Self::Latest(key)
    }
}

impl From<MaximumKey> for Key {
    fn from(key: MaximumKey) -> Self {
        Self::Maximum(key)
    }
}

pub(crate) struct Address {
    pub(crate) profile: ProfileId,
    pub(crate) entity: &'static str,
    pub(crate) id: [u8; 16],
    pub(crate) field: &'static str,
}

impl Key {
    pub(crate) const fn book(self) -> Option<BookId> {
        match self {
            Self::Latest(LatestKey::BookPosition(book) | LatestKey::BookRead(book))
            | Self::Maximum(MaximumKey::BookFurthest(book)) => Some(book),
            Self::Bookmark(_) => None,
        }
    }

    pub(crate) const fn address(self, profile: ProfileId) -> Address {
        match self {
            Self::Latest(key) => key.address(profile),
            Self::Maximum(key) => key.address(profile),
            Self::Bookmark(key) => key.address(profile),
        }
    }

    pub(crate) fn stored(entity: &str, id: &[u8], field: &str) -> Result<Option<Self>, IdError> {
        let book = || BookId::try_from(id);
        let bookmark = || BookmarkId::try_from(id);
        Ok(match (entity, field) {
            (BOOKMARK, BOOK_HIGH) => Some(BookmarkKey::BookHigh(bookmark()?).into()),
            (BOOKMARK, BOOK_LOW) => Some(BookmarkKey::BookLow(bookmark()?).into()),
            (BOOKMARK, PAGE) => Some(BookmarkKey::Page(bookmark()?).into()),
            (BOOKMARK, DELETED) => Some(BookmarkKey::Deleted(bookmark()?).into()),
            (BOOK, POSITION) => Some(LatestKey::BookPosition(book()?).into()),
            (BOOK, READ) => Some(LatestKey::BookRead(book()?).into()),
            (BOOK, FURTHEST) => Some(MaximumKey::BookFurthest(book()?).into()),
            _ => None,
        })
    }
}

impl LatestKey {
    pub(crate) const fn address(self, profile: ProfileId) -> Address {
        match self {
            Self::BookPosition(book) => book_field(profile, book, POSITION),
            Self::BookRead(book) => book_field(profile, book, READ),
        }
    }
}

impl MaximumKey {
    pub(crate) const fn address(self, profile: ProfileId) -> Address {
        match self {
            Self::BookFurthest(book) => book_field(profile, book, FURTHEST),
        }
    }
}

const fn book_field(profile: ProfileId, book: BookId, field: &'static str) -> Address {
    Address {
        profile,
        entity: BOOK,
        id: *book.as_bytes(),
        field,
    }
}

#[cfg(test)]
mod tests {
    use omnileaf_sync_proto::{Fingerprint, ImageEntry};

    use super::*;

    fn every_key(book: BookId) -> Vec<Key> {
        let bookmark = BookmarkId::of(book, 3);
        let mut keys = Vec::new();
        let mut next = Some(Key::from(LatestKey::BookPosition(book)));
        while let Some(key) = next {
            keys.push(key);
            next = match key {
                Key::Latest(LatestKey::BookPosition(_)) => Some(LatestKey::BookRead(book).into()),
                Key::Latest(LatestKey::BookRead(_)) => Some(MaximumKey::BookFurthest(book).into()),
                Key::Maximum(MaximumKey::BookFurthest(_)) => {
                    Some(BookmarkKey::BookHigh(bookmark).into())
                }
                Key::Bookmark(BookmarkKey::BookHigh(_)) => {
                    Some(BookmarkKey::BookLow(bookmark).into())
                }
                Key::Bookmark(BookmarkKey::BookLow(_)) => Some(BookmarkKey::Page(bookmark).into()),
                Key::Bookmark(BookmarkKey::Page(_)) => Some(BookmarkKey::Deleted(bookmark).into()),
                Key::Bookmark(BookmarkKey::Deleted(_)) => None,
            };
        }
        keys
    }

    #[test]
    fn reads_every_key_back_from_where_it_is_stored() {
        let book = BookId::local(&Fingerprint::pmf1([ImageEntry { crc32: 1, size: 1 }]).unwrap());
        let keys = every_key(book);

        let read_back: Vec<Option<Key>> = keys
            .iter()
            .map(|key| {
                let address = key.address(ProfileId::default_profile());
                Key::stored(address.entity, &address.id, address.field).unwrap()
            })
            .collect();

        assert_eq!(read_back, keys.into_iter().map(Some).collect::<Vec<_>>());
    }

    #[test]
    fn leaves_a_field_this_version_does_not_know_unread() {
        let read = Key::stored(BOOK, &[0; 16], "rating");

        assert!(matches!(read, Ok(None)));
    }
}
