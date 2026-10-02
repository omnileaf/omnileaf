//! Comic archives and image folders: what they contain, in reading order.

mod book;
mod comic_info;
mod container;
mod entries;
mod error;
mod folder;
mod limits;
mod natural;
mod zip_book;

pub use book::{Book, Page, open_book, open_book_with};
pub use comic_info::{
    ComicInfo, ComicInfoError, PageInfo, PageKind, ReadingDirection, parse_comic_info,
};
pub use entries::{is_ignored, is_page_image};
pub use error::FormatError;
pub use limits::Limits;
pub use natural::natural_cmp;
