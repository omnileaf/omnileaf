//! The library folders and the series and books found in them, which every device derives from its own files.

mod book;
mod cover;
mod cursor;
mod home_root;
mod library_roots;
mod native_path;
mod page;
mod root;
mod root_availability;
mod root_files;
mod scanned_book;
mod series;
mod series_books;
mod series_count;
mod series_page;
mod stored_id;

pub use book::{NewBook, add_book, remove_books_without_files};
pub use cover::{BookFileId, Cover, cover_file};
pub use cursor::Cursor;
pub use home_root::set_home_root;
pub use library_roots::{bookmarked_roots, library_root, library_roots};
pub use page::{Page, PageRequest, PageSize};
pub use root::{
    AppleBookmark, LibraryRoot, NewRoot, RootId, RootKind, RootLocator, add_root, relocate_root,
    remove_root,
};
pub use root_availability::{mark_root_available, mark_root_unavailable};
pub use root_files::{StoredFile, remove_book_files, root_book_count, root_files};
pub use scanned_book::{BookFile, ScannedBook, record_moved_books, record_scanned_books};
pub use series::{NewSeries, add_series};
pub use series_books::{BookSummary, series_books};
pub use series_count::series_count;
pub use series_page::{SeriesOrder, SeriesSummary, series_page};
