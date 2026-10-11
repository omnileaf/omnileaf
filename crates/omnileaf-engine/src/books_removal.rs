use serde::Serialize;
use specta::Type;

/// What asking to remove the books of a folder found empty did.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum BooksRemoval {
    /// Counts only the books no other folder holds, since those stay.
    Removed { books: u32 },
    /// The folder couldn't be read in full or holds books again, so nothing was removed.
    Kept,
}
