use omnileaf_db::Database;

use crate::library_seed::{SeriesSeed, seed_library};

pub(crate) const SERIES_COUNT: u32 = 10_000;

/// Adds series "Sample Series 00000" onwards, each holding `books` and added a millisecond after the one before.
pub(crate) async fn add_generated_series(database: &Database, books: &[&str]) {
    let names: Vec<(String, i64)> = (0..SERIES_COUNT)
        .map(|number| (format!("Sample Series {number:05}"), i64::from(number)))
        .collect();
    let series: Vec<SeriesSeed<'_>> = names
        .iter()
        .map(|(name, added_at_ms)| SeriesSeed {
            added_at_ms: *added_at_ms,
            book_titles: books,
            ..SeriesSeed::named(name)
        })
        .collect();
    seed_library(database, &series).await;
}
