//! Comic archives and image folders: what they contain, in reading order.

mod entries;
mod natural;

pub use entries::{is_ignored, is_page_image};
pub use natural::natural_cmp;
