#![expect(
    clippy::unwrap_used,
    reason = "seeding the library and both profiles is test set-up, so a failure should stop the test"
)]

mod library_seed;
mod support;

use std::{num::NonZeroUsize, time::Duration};

use library_seed::{SeriesSeed, fingerprint, seed_library};
use omnileaf_db::{
    Database,
    store::{Clock, Store},
};
use omnileaf_sync_proto::{BookId, ProfileId};
use omnileaf_testkit::{Sampling, SpeedTrial, Statistic, TimingBudget};
use support::{ScratchFolder, library_config};

const SERIES_COUNT: u32 = 10_000;
const BUDGET: Duration = Duration::from_secs(3);
const SWITCHES: usize = 4;
const ANOTHER_PROFILE: &str = "0b5e1a3c-7d2f-8a4b-9c6d-1e2f3a4b5c6d";
const BOOK_TITLE: &str = "Volume 01";

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
async fn switches_profile_over_10_000_series_started_in_both_within_3_s() {
    let trial = SpeedTrial {
        measured: "switching profile over 10,000 series started in both profiles",
        sampling: Sampling::Repeated {
            samples: NonZeroUsize::new(SWITCHES).unwrap(),
            statistic: Statistic::Slowest,
        },
        budget: TimingBudget::from_env(BUDGET),
    };
    let folder = ScratchFolder::new("profile-switch-speed");
    let database = Database::open(&library_config(&folder)).unwrap();
    let names = series_names();
    seed_library(&database, &seeds(&names)).await;
    let store = Store::new(database, StoppedClock);
    let another_profile: ProfileId = ANOTHER_PROFILE.parse().unwrap();
    start_every_book(&store, &names, 3).await;
    store.switch_profile(another_profile).await.unwrap();
    start_every_book(&store, &names, 5).await;
    let profiles = [ProfileId::default_profile(), another_profile];

    let outcome = trial
        .run(
            async |_| profiles.into_iter().cycle(),
            async |profiles| {
                store
                    .switch_profile(profiles.next().unwrap())
                    .await
                    .unwrap();
            },
        )
        .await;

    eprintln!("{outcome}");
    assert!(outcome.is_within_budget(), "{outcome}");
}

fn series_names() -> Vec<String> {
    (0..SERIES_COUNT)
        .map(|number| format!("Sample Series {number:05}"))
        .collect()
}

fn seeds(names: &[String]) -> Vec<SeriesSeed<'_>> {
    names
        .iter()
        .map(|name| SeriesSeed::named(name.as_str()))
        .collect()
}

async fn start_every_book(store: &Store, names: &[String], page: u32) {
    let books: Vec<BookId> = names
        .iter()
        .map(|name| BookId::local(&fingerprint(name, BOOK_TITLE)))
        .collect();
    store
        .write(move |writer| {
            for book in books {
                writer.set_position(book, page)?;
                writer.raise_furthest(book, page)?;
                writer.set_read(book, false)?;
            }
            Ok(())
        })
        .await
        .unwrap();
}
