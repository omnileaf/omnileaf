#![expect(
    clippy::unwrap_used,
    reason = "the details are read from a library a test scanned, so a failed read should stop the test"
)]

use omnileaf_db::rusqlite::{Connection, types::Value};

pub(crate) fn stored_details(connection: &Connection) -> Vec<Vec<Value>> {
    connection
        .prepare(
            "SELECT series, number, title, volume, summary, publisher, format, language,
                reading_direction, age_rating, year
            FROM book_details ORDER BY book_id",
        )
        .unwrap()
        .query_map([], |row| {
            (0..row.as_ref().column_count())
                .map(|column| row.get(column))
                .collect()
        })
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap()
}
