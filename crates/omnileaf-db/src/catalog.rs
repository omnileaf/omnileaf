//! The series and books found in library folders, which every device derives from its own files.

mod book;
mod series;

pub use book::{NewBook, add_book};
pub use series::{NewSeries, add_series};
