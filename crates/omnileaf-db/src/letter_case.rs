//! Letter case folded alike in Rust and in SQL, whatever the script.

use rusqlite::{Connection, functions::FunctionFlags};

const FOLD_CASE_ARGUMENTS: i32 = 1;

pub(crate) fn fold_case(text: &str) -> String {
    text.chars().flat_map(char::to_lowercase).collect()
}

/// Lets SQL call `fold_case(text)`, since SQLite's own `lower` and `LIKE` fold only ASCII letters.
pub(crate) fn add_fold_case(connection: &Connection) -> rusqlite::Result<()> {
    connection.create_scalar_function(
        "fold_case",
        FOLD_CASE_ARGUMENTS,
        FunctionFlags::SQLITE_UTF8 | FunctionFlags::SQLITE_DETERMINISTIC,
        |context| Ok(fold_case(&context.get::<String>(0)?)),
    )
}
