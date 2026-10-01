//! Comic archives and image folders: what they contain, in reading order.

mod book;
mod entries;
mod error;
mod folder;
mod limits;
mod natural;
mod zip_book;

pub use book::{Book, Page, open_book, open_book_with};
pub use entries::{is_ignored, is_page_image};
pub use error::FormatError;
pub use limits::Limits;
pub use natural::natural_cmp;
