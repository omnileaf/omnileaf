//! The series and books found in library folders, which every device derives from its own files.

mod book;
mod cursor;
mod page;
mod series;
mod series_page;
mod stored_id;

pub use book::{NewBook, add_book};
pub use cursor::Cursor;
pub use page::{Page, PageRequest, PageSize};
pub use series::{NewSeries, add_series};
pub use series_page::{SeriesOrder, SeriesSummary, series_page};
