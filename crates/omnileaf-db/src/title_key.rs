//! The keys series titles sort by, made by the collation of the app's language and re-made whenever that collation changes.

mod articles;
mod collation;
mod language;
mod resort;
mod stamp;

pub(crate) use collation::TitleCollation;
pub use language::Language;
pub(crate) use resort::{Resorted, keep_titles_sorted, sort_titles_for};
pub(crate) use stamp::stored_language;
