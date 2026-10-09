//! Letter case folded alike in Rust and in SQL, whatever the script.

use omnileaf_sync_proto::norm;
use rusqlite::{Connection, functions::FunctionFlags};

const FOLD_CASE_ARGUMENTS: i32 = 1;

/// Folds as [`norm`] does, taking a shortcut through ASCII text, where normalising changes nothing and folding is lowercasing, since a search folds every title it reads.
pub(crate) fn fold_case(text: &str) -> String {
    if text.is_ascii() {
        text.split_whitespace()
            .map(str::to_ascii_lowercase)
            .collect::<Vec<_>>()
            .join(" ")
    } else {
        norm(text)
    }
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

#[cfg(test)]
mod tests {
    use proptest::prelude::*;

    use super::*;

    proptest! {
        #[test]
        fn folds_ascii_text_as_norm_does(text in "[ -~\t\n\x0b\x0c\r]{0,40}") {
            prop_assert_eq!(fold_case(&text), norm(&text));
        }
    }
}
