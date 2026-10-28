#![expect(
    clippy::unwrap_used,
    reason = "seeding the library is test set-up, so a failure should stop the test"
)]

mod library_seed;
mod support;

use std::{num::NonZeroUsize, time::Duration};

use library_seed::{SeriesSeed, seed_library};
use omnileaf_db::{
    Database,
    store::{Clock, Store},
};
use omnileaf_testkit::{Sampling, SpeedTrial, Statistic, TimingBudget};
use support::{ScratchFolder, library_config};

const SERIES_COUNT: u32 = 10_000;
const BUDGET: Duration = Duration::from_millis(150);
const LANGUAGES: [&str; 4] = ["sv", "en", "sv", "en"];
const A_WRITER_FOR_EACH_SERIES: &str = "
    INSERT INTO book_details (book_id) SELECT id FROM book;
    INSERT INTO book_person (book_id, role, name)
        SELECT book.id, 'writer', series.title || ' Writer'
        FROM book JOIN series ON series.local_id = book.series_local_id;
";

struct StoppedClock;

impl Clock for StoppedClock {
    fn now_unix_ms(&self) -> u64 {
        0
    }
}

#[tokio::test]
#[expect(
    clippy::print_stderr,
    reason = "the gate logs the measured timings so each platform's margin under the budget shows on every run"
)]
#[ignore = "a timing budget means something only in an optimised build, so the gate runs it on its own in release"]
async fn keys_10_000_titles_and_writers_names_again_for_each_language_within_150_ms() {
    let trial = SpeedTrial {
        measured: "re-keying 10,000 titles and writers' names for a language",
        sampling: Sampling::Repeated {
            samples: NonZeroUsize::new(LANGUAGES.len()).unwrap(),
            statistic: Statistic::Slowest,
        },
        budget: TimingBudget::from_env(BUDGET),
    };
    let folder = ScratchFolder::new("title-rekey-speed");
    let database = Database::open(&library_config(&folder)).unwrap();
    add_generated_series(&database).await;
    let store = Store::new(database, StoppedClock);

    let outcome = trial
        .run(
            async |_| LANGUAGES.into_iter(),
            async |languages| {
                let language = languages.next().unwrap();
                store
                    .sort_titles_for(language.parse().unwrap())
                    .await
                    .unwrap();
            },
        )
        .await;

    eprintln!("{outcome}");
    assert!(outcome.is_within_budget(), "{outcome}");
}

/// Swedish collation files Ä after Z where English files it under A, so each switch between them changes every key.
async fn add_generated_series(database: &Database) {
    let names: Vec<String> = (0..SERIES_COUNT)
        .map(|number| format!("Ärger Sample {number:05}"))
        .collect();
    let series: Vec<SeriesSeed<'_>> = names
        .iter()
        .map(|name| SeriesSeed {
            added_at_ms: 0,
            ..SeriesSeed::named(name.as_str())
        })
        .collect();
    seed_library(database, &series).await;
    database
        .write(|transaction| Ok(transaction.execute_batch(A_WRITER_FOR_EACH_SERIES)?))
        .await
        .unwrap();
}
