use std::borrow::Cow;

use omnileaf_sync_proto::{BookId, BookmarkId, CategoryId, IdError, ProfileId, SeriesId, TagId};

const BOOK: &str = "book";
const POSITION: &str = "pos";
const READ: &str = "read";
const FURTHEST: &str = "max";
const BOOKMARK: &str = "bookmark";
const BOOK_HIGH: &str = "book_hi";
const BOOK_LOW: &str = "book_lo";
const PAGE: &str = "page";
const DELETED: &str = "deleted";
const CATEGORY: &str = "category";
const TAG: &str = "tag";
const SERIES: &str = "series";
const NAME: &str = "name";
const ORDER: &str = "order";

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
            field: Cow::Borrowed(field),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum LabelKey {
    CategoryName(CategoryId),
    CategoryOrder(CategoryId),
    CategoryDeleted(CategoryId),
    TagName(TagId),
    TagDeleted(TagId),
    SeriesCategory {
        series: SeriesId,
        category: CategoryId,
    },
    SeriesTag {
        series: SeriesId,
        tag: TagId,
    },
}

impl LabelKey {
    fn address(self, profile: ProfileId) -> Address {
        let (entity, id, field) = match self {
            Self::CategoryName(id) => (CATEGORY, *id.as_bytes(), Cow::Borrowed(NAME)),
            Self::CategoryOrder(id) => (CATEGORY, *id.as_bytes(), Cow::Borrowed(ORDER)),
            Self::CategoryDeleted(id) => (CATEGORY, *id.as_bytes(), Cow::Borrowed(DELETED)),
            Self::TagName(id) => (TAG, *id.as_bytes(), Cow::Borrowed(NAME)),
            Self::TagDeleted(id) => (TAG, *id.as_bytes(), Cow::Borrowed(DELETED)),
            Self::SeriesCategory { series, category } => (
                SERIES,
                *series.as_bytes(),
                Cow::Owned(category.membership_field()),
            ),
            Self::SeriesTag { series, tag } => (
                SERIES,
                *series.as_bytes(),
                Cow::Owned(tag.membership_field()),
            ),
        };
        Address {
            profile,
            entity,
            id,
            field,
        }
    }

    fn stored(entity: &str, id: &[u8], field: &str) -> Result<Option<Self>, IdError> {
        Ok(match (entity, field) {
            (CATEGORY, NAME) => Some(Self::CategoryName(CategoryId::try_from(id)?)),
            (CATEGORY, ORDER) => Some(Self::CategoryOrder(CategoryId::try_from(id)?)),
            (CATEGORY, DELETED) => Some(Self::CategoryDeleted(CategoryId::try_from(id)?)),
            (TAG, NAME) => Some(Self::TagName(TagId::try_from(id)?)),
            (TAG, DELETED) => Some(Self::TagDeleted(TagId::try_from(id)?)),
            (SERIES, _) => {
                let series = || SeriesId::try_from(id);
                if let Some(category) = CategoryId::from_membership_field(field) {
                    Some(Self::SeriesCategory {
                        series: series()?,
                        category,
                    })
                } else if let Some(tag) = TagId::from_membership_field(field) {
                    Some(Self::SeriesTag {
                        series: series()?,
                        tag,
                    })
                } else {
                    None
                }
            }
            _ => None,
        })
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum Key {
    Latest(LatestKey),
    Maximum(MaximumKey),
    Bookmark(BookmarkKey),
    Label(LabelKey),
}

impl From<LabelKey> for Key {
    fn from(key: LabelKey) -> Self {
        Self::Label(key)
    }
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
    pub(crate) field: Cow<'static, str>,
}

impl Key {
    pub(crate) const fn book(self) -> Option<BookId> {
        match self {
            Self::Latest(LatestKey::BookPosition(book) | LatestKey::BookRead(book))
            | Self::Maximum(MaximumKey::BookFurthest(book)) => Some(book),
            Self::Bookmark(_) | Self::Label(_) => None,
        }
    }

    pub(crate) fn address(self, profile: ProfileId) -> Address {
        match self {
            Self::Latest(key) => key.address(profile),
            Self::Maximum(key) => key.address(profile),
            Self::Bookmark(key) => key.address(profile),
            Self::Label(key) => key.address(profile),
        }
    }

    pub(crate) fn stored(entity: &str, id: &[u8], field: &str) -> Result<Option<Self>, IdError> {
        let book = || BookId::try_from(id);
        let bookmark = || BookmarkId::try_from(id);
        if let Some(label) = LabelKey::stored(entity, id, field)? {
            return Ok(Some(label.into()));
        }
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
        field: Cow::Borrowed(field),
    }
}

#[cfg(test)]
mod tests {
    use omnileaf_sync_proto::{Fingerprint, ImageEntry};

    use super::*;

    fn every_key(book: BookId) -> Vec<Key> {
        let bookmark = BookmarkId::of(book, 3);
        let category = CategoryId::from_name("Sample Shelf").unwrap();
        let tag = TagId::from_name("Sample Tag").unwrap();
        let series = SeriesId::local("Sample Series 03").unwrap();
        vec![
            LatestKey::BookPosition(book).into(),
            LatestKey::BookRead(book).into(),
            MaximumKey::BookFurthest(book).into(),
            BookmarkKey::BookHigh(bookmark).into(),
            BookmarkKey::BookLow(bookmark).into(),
            BookmarkKey::Page(bookmark).into(),
            BookmarkKey::Deleted(bookmark).into(),
            LabelKey::CategoryName(category).into(),
            LabelKey::CategoryOrder(category).into(),
            LabelKey::CategoryDeleted(category).into(),
            LabelKey::TagName(tag).into(),
            LabelKey::TagDeleted(tag).into(),
            LabelKey::SeriesCategory { series, category }.into(),
            LabelKey::SeriesTag { series, tag }.into(),
        ]
    }

    #[test]
    fn reads_every_key_back_from_where_it_is_stored() {
        let book = BookId::local(&Fingerprint::pmf1([ImageEntry { crc32: 1, size: 1 }]).unwrap());
        let keys = every_key(book);

        let read_back: Vec<Option<Key>> = keys
            .iter()
            .map(|key| {
                let address = key.address(ProfileId::default_profile());
                Key::stored(address.entity, &address.id, &address.field).unwrap()
            })
            .collect();

        assert_eq!(read_back, keys.into_iter().map(Some).collect::<Vec<_>>());
    }

    #[test]
    fn leaves_a_field_this_version_does_not_know_unread() {
        let read = Key::stored(BOOK, &[0; 16], "rating");

        assert!(matches!(read, Ok(None)));
    }

    #[test]
    fn writes_a_membership_field_as_the_id_in_lowercase_hex() {
        let series = SeriesId::local("Sample Series 03").unwrap();
        let category = CategoryId::from_name("Sample Shelf").unwrap();

        let address = Key::from(LabelKey::SeriesCategory { series, category })
            .address(ProfileId::default_profile());

        assert_eq!(
            address.field,
            format!("cat.{}", category.to_string().replace('-', ""))
        );
    }

    #[test]
    fn leaves_a_membership_field_that_is_not_an_id_in_hex_unread() {
        let series = SeriesId::local("Sample Series 03").unwrap();
        let id = series.as_bytes();

        let unread = [
            "cat.zz",
            "cat.",
            "tag.0123",
            "mood.0123",
            "cat.G0000000000000000000000000000000",
        ]
        .map(|field| Key::stored(SERIES, id, field).unwrap());

        assert_eq!(unread, [None; 5]);
    }
}
