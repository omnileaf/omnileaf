use omnileaf_sync_proto::BookId;
use rusqlite::{Connection, OptionalExtension};

use crate::Error;

const STATE_OF_BOOK: &str = "SELECT position_page, furthest_page, is_read
    FROM book_state
    WHERE book_id = ?1";

/// Where a reader is in one book, as the synced registers last projected it.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct ReadingState {
    pub position_page: Option<u32>,
    pub furthest_page: Option<u32>,
    pub is_read: Option<bool>,
}

/// None for a book nothing has been read in, or whose every reading register was cleared.
pub fn reading_state(connection: &Connection, book: BookId) -> Result<Option<ReadingState>, Error> {
    let state = connection
        .prepare(STATE_OF_BOOK)?
        .query_row([book.as_bytes()], |row| {
            Ok(ReadingState {
                position_page: row.get(0)?,
                furthest_page: row.get(1)?,
                is_read: row.get(2)?,
            })
        })
        .optional()?;
    Ok(state.filter(|state| *state != ReadingState::default()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scratch::ScratchLibrary;

    #[test]
    fn reads_a_book_s_state_by_its_key() {
        let scratch = ScratchLibrary::new("reading-state-plan");

        let plan = scratch.query_plan(STATE_OF_BOOK);

        assert_eq!(plan, ["SEARCH book_state USING PRIMARY KEY (book_id=?)"]);
    }
}
