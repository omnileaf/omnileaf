//! The keys series titles sort by, made by the collation of the app's language and re-made whenever that collation changes.

mod collation;
mod language;
mod resort;
mod stamp;

pub(crate) use collation::TitleCollation;
pub use language::Language;
pub(crate) use resort::keep_titles_sorted;
pub(crate) use stamp::stored_language;
