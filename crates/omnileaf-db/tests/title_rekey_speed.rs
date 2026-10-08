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
const ONE_BOOK: &[&str] = &["Volume 01"];

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
async fn keys_10_000_titles_again_for_each_language_within_150_ms() {
    let trial = SpeedTrial {
        measured: "re-keying 10,000 titles for a language",
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

/// Starts every title with a letter Swedish files after Z and English files under A, so each switch between them changes every key.
async fn add_generated_series(database: &Database) {
    let names: Vec<String> = (0..SERIES_COUNT)
        .map(|number| format!("Ärger Sample {number:05}"))
        .collect();
    let series: Vec<SeriesSeed<'_>> = names
        .iter()
        .map(|name| (name.as_str(), 0, ONE_BOOK))
        .collect();
    seed_library(database, &series).await;
}
