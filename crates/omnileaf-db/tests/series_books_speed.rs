#![expect(
    clippy::unwrap_used,
    reason = "the test builds its own scratch library, so a failed set-up should stop it"
)]

mod library_seed;
mod support;

use std::{num::NonZeroUsize, time::Duration};

use library_seed::{SeriesSeed, seed_library};
use omnileaf_db::{
    Database,
    catalog::{
        BookListing, BooksShown, NewSeries, PageRequest, PageSize, SortDirection, series_books,
    },
};
use omnileaf_sync_proto::SeriesId;
use omnileaf_testkit::{Sampling, SpeedTrial, Statistic, TimingBudget};
use support::{ScratchFolder, library_config};

const SERIES: &str = "Sample Series 00000";
const BOOK_COUNT: u32 = 10_000;
const UNREAD_AT_THE_END: u32 = 100;
const PAGE_SIZE: u16 = 100;
const SAMPLES: usize = 40;
const BUDGET: Duration = Duration::from_millis(10);
const LISTINGS: [BookListing; 4] = [
    BookListing {
        shown: BooksShown::All,
        direction: SortDirection::Ascending,
    },
    BookListing {
        shown: BooksShown::All,
        direction: SortDirection::Descending,
    },
    BookListing {
        shown: BooksShown::Unread,
        direction: SortDirection::Ascending,
    },
    BookListing {
        shown: BooksShown::Unread,
        direction: SortDirection::Descending,
    },
];

#[tokio::test]
#[expect(
    clippy::print_stderr,
    reason = "the gate logs the measured timings so each platform's margin under the budget shows on every run"
)]
#[ignore = "a timing budget means something only in an optimised build, so the gate runs it on its own in release"]
async fn reads_the_first_page_of_a_10_000_book_series_in_any_listing_within_10_ms_at_p95() {
    let trial = SpeedTrial {
        measured: "the first page of 100 of a 10,000-book series' books, all or only unread, either way round",
        sampling: Sampling::Repeated {
            samples: NonZeroUsize::new(SAMPLES).unwrap(),
            statistic: Statistic::Percentile95,
        },
        budget: TimingBudget::from_env(BUDGET),
    };
    let folder = ScratchFolder::new("series-books-speed");
    let database = Database::open(&library_config(&folder)).unwrap();
    let series = add_long_series(&database).await;

    let outcome = trial
        .run(
            async |_| LISTINGS.iter().cycle(),
            async |listings| {
                let listing = *listings.next().unwrap();
                read_first_page(&database, series, listing).await;
            },
        )
        .await;

    eprintln!("{outcome}");
    assert!(outcome.is_within_budget(), "{outcome}");
}

/// Adds one series of 10,000 books with all but the last 100 marked read, so an unread page either way round looks past nearly every book to learn whether another page follows.
async fn add_long_series(database: &Database) -> SeriesId {
    let titles: Vec<String> = (0..BOOK_COUNT)
        .map(|number| format!("Volume {number:05}"))
        .collect();
    let book_titles: Vec<&str> = titles.iter().map(String::as_str).collect();
    seed_library(
        database,
        &[SeriesSeed {
            book_titles: &book_titles,
            ..SeriesSeed::named(SERIES)
        }],
    )
    .await;
    let read_before = format!("Volume {:05}", BOOK_COUNT - UNREAD_AT_THE_END);
    database
        .write(move |transaction| {
            transaction.execute(
                "INSERT INTO book_state (book_id, is_read) SELECT id, 1 FROM book WHERE title < ?1",
                [read_before],
            )?;
            Ok(())
        })
        .await
        .unwrap();
    NewSeries::local(SERIES, 0).unwrap().id()
}

async fn read_first_page(database: &Database, series: SeriesId, listing: BookListing) {
    let request = PageRequest {
        after: None,
        size: PageSize::try_from(PAGE_SIZE).unwrap(),
    };
    let page = database
        .read(move |connection| series_books(connection, series, listing, &request))
        .await
        .unwrap();
    assert_eq!(page.items.len(), usize::from(PAGE_SIZE));
}
