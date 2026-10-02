use omnileaf_sync_proto::BookId;

const BOOK: &str = "book";
const POSITION: &str = "pos";
const READ: &str = "read";

/// A register that keeps the last write.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum LatestKey {
    BookPosition(BookId),
    BookRead(BookId),
}

/// Where a register is stored, under the names every device gives it.
pub(crate) struct Address {
    pub(crate) entity: &'static str,
    pub(crate) id: [u8; 16],
    pub(crate) field: &'static str,
}

impl LatestKey {
    pub(crate) const fn address(self) -> Address {
        match self {
            Self::BookPosition(book) => book_field(book, POSITION),
            Self::BookRead(book) => book_field(book, READ),
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
