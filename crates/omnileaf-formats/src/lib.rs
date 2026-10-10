//! Comic archives and image folders: what they contain, in reading order, and the fingerprint that identifies them.

mod block_reader;
mod book;
mod comic_info;
mod container;
mod entries;
mod error;
mod fingerprint;
mod folder;
mod limits;
mod natural;
mod storage;
mod zip_book;

pub use book::{Book, Page, open_book, open_book_in, open_book_with};
pub use comic_info::{
    ComicInfo, ComicInfoError, PageInfo, PageKind, ReadingDirection, parse_comic_info,
};
pub use entries::{is_ignored, is_page_image};
pub use error::{FormatError, UnsupportedArchive};
pub use fingerprint::{fingerprint_book, fingerprint_book_with};
pub use limits::Limits;
pub use natural::natural_cmp;
pub use storage::{Details, Entry, EntryKind, LocalStorage, Storage};
