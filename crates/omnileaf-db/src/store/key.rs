use omnileaf_sync_proto::{BookId, IdError};

const BOOK: &str = "book";
const POSITION: &str = "pos";
const READ: &str = "read";
const FURTHEST: &str = "max";

/// A register that keeps the last write.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum LatestKey {
    BookPosition(BookId),
    BookRead(BookId),
}

/// A register that keeps the write of highest rank.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum MaximumKey {
    BookFurthest(BookId),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Key {
    Latest(LatestKey),
    Maximum(MaximumKey),
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

/// Where a register is stored, under the names every device gives it.
pub(crate) struct Address {
    pub(crate) entity: &'static str,
    pub(crate) id: [u8; 16],
    pub(crate) field: &'static str,
}

impl Key {
    pub(crate) const fn address(self) -> Address {
        match self {
            Self::Latest(key) => key.address(),
            Self::Maximum(key) => key.address(),
        }
    }

    /// None for a register a newer version wrote, which is kept and passed on but not projected.
    pub(crate) fn stored(entity: &str, id: &[u8], field: &str) -> Result<Option<Self>, IdError> {
        let book = || BookId::try_from(id);
        Ok(match (entity, field) {
            (BOOK, POSITION) => Some(LatestKey::BookPosition(book()?).into()),
            (BOOK, READ) => Some(LatestKey::BookRead(book()?).into()),
            (BOOK, FURTHEST) => Some(MaximumKey::BookFurthest(book()?).into()),
            _ => None,
        })
    }
}

impl LatestKey {
    pub(crate) const fn address(self) -> Address {
        match self {
            Self::BookPosition(book) => book_field(book, POSITION),
            Self::BookRead(book) => book_field(book, READ),
        }
    }
}

impl MaximumKey {
    pub(crate) const fn address(self) -> Address {
        match self {
            Self::BookFurthest(book) => book_field(book, FURTHEST),
        }
    }
}

const fn book_field(book: BookId, field: &'static str) -> Address {
    Address {
        entity: BOOK,
        id: *book.as_bytes(),
        field,
    }
}

#[cfg(test)]
mod tests {
    use omnileaf_sync_proto::{Fingerprint, ImageEntry};

    use super::*;

    #[test]
    fn reads_every_key_back_from_where_it_is_stored() {
        let book = BookId::local(&Fingerprint::pmf1([ImageEntry { crc32: 1, size: 1 }]).unwrap());
        let keys = [
            Key::from(LatestKey::BookPosition(book)),
            Key::from(LatestKey::BookRead(book)),
            Key::from(MaximumKey::BookFurthest(book)),
        ];

        let read_back: Vec<Option<Key>> = keys
            .iter()
            .map(|key| {
                let address = key.address();
                Key::stored(address.entity, &address.id, address.field).unwrap()
            })
            .collect();

        assert_eq!(read_back, keys.map(Some));
    }

    #[test]
    fn leaves_a_field_this_version_does_not_know_unread() {
        let read = Key::stored(BOOK, &[0; 16], "rating");

        assert!(matches!(read, Ok(None)));
    }
}
