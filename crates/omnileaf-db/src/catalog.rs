//! The library folders and the series and books found in them, which every device derives from its own files.

mod book;
mod cursor;
mod home_root;
mod library_roots;
mod native_path;
mod page;
mod root;
mod root_availability;
mod scanned_book;
mod series;
mod series_books;
mod series_page;
mod stored_id;

pub use book::{NewBook, add_book};
pub use cursor::Cursor;
pub use home_root::set_home_root;
pub use library_roots::{library_root, library_roots};
pub use page::{Page, PageRequest, PageSize};
pub use root::{LibraryRoot, NewRoot, RootId, RootKind, RootLocator, add_root, remove_root};
pub use root_availability::{mark_root_available, mark_root_unavailable};
pub use scanned_book::{BookFile, ScannedBook, record_scanned_books};
pub use series::{NewSeries, add_series};
pub use series_books::{BookSummary, series_books};
pub use series_page::{SeriesOrder, SeriesSummary, series_page};
