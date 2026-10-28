#![expect(
    clippy::unwrap_used,
    reason = "the test builds its own scratch library, so a failed set-up should stop it"
)]

mod library_seed;
mod speed;
mod support;

use std::{num::NonZeroUsize, time::Duration};

use omnileaf_db::{
    Database,
    catalog::{
        Cursor, Inclusion, PageRequest, PageSize, SeriesFilter, SeriesListing, SeriesOrder,
        SeriesSort, series_count, series_page,
    },
};
use omnileaf_testkit::{Sampling, SpeedTrial, Statistic, TimingBudget};
use rusqlite::Transaction;
use speed::add_generated_series;
use support::{ScratchFolder, library_config};

const BOOK_TITLES: [&str; 10] = [
    "Volume 01",
    "Volume 02",
    "Volume 03",
    "Volume 04",
    "Volume 05",
    "Volume 06",
    "Volume 07",
    "Volume 08",
    "Volume 09",
    "Volume 10",
];
const EVERY_HUNDREDTH_FINISHED: u32 = 100;
const EVERY_TENTH_STARTED: u32 = 10;
const EVERY_HUNDREDTH_FORGOTTEN: u32 = 100;
const FORGOTTEN_REMAINDER: u32 = 1;
const READ_LONG_AGO_MS: i64 = 1_000;
const READ_LATELY_MS: i64 = 2_000;
const SESSION_PAGE_COUNT: u32 = 24;
const EVERY_HUNDREDTH_COPIED: u32 = 100;
const COPIED_REMAINDER: u32 = 2;
const COPIES_FOLDER: &[u8] = b"/media/Copies";
const EVERY_HUNDREDTH_IN_A_RARE_LANGUAGE: u32 = 100;
const RARE_LANGUAGE_REMAINDER: u32 = 3;
const RARE_LANGUAGE: &str = "ja";
const EVERY_HUNDREDTH_RATED_ADULT: u32 = 100;
const RATED_ADULT_REMAINDER: u32 = 4;
const PAGE_SIZE: u16 = 100;
const SAMPLES: usize = 40;
const BUDGET: Duration = Duration::from_millis(2);

const SORTS: [SeriesSort; 4] = [
    SeriesSort::ascending(SeriesOrder::Title),
    SeriesSort::descending(SeriesOrder::Title),
    SeriesSort::ascending(SeriesOrder::DateAdded),
    SeriesSort::descending(SeriesOrder::DateAdded),
];

/// No filter, and each condition alone either way, which takes in the filters matching a hundredth of the library and so reading furthest for a page.
fn filters() -> [SeriesFilter; 12] {
    [
        SeriesFilter::NONE,
        SeriesFilter::NONE.with_unread(Inclusion::Only),
        SeriesFilter::NONE.with_unread(Inclusion::Hide),
        SeriesFilter::NONE.with_started(Inclusion::Only),
        SeriesFilter::NONE.with_started(Inclusion::Hide),
        SeriesFilter::NONE.with_finished(Inclusion::Only),
        SeriesFilter::NONE.with_finished(Inclusion::Hide),
        SeriesFilter::NONE.with_last_read_before_ms(Some(READ_LATELY_MS)),
        SeriesFilter::NONE.with_duplicates(Inclusion::Only),
        SeriesFilter::NONE.with_languages(vec![RARE_LANGUAGE.to_owned()]),
        SeriesFilter::NONE.with_adult(Inclusion::Only, true),
        SeriesFilter::NONE.with_adult(Inclusion::Hide, true),
    ]
}

#[tokio::test]
#[expect(
    clippy::print_stderr,
    reason = "the gate logs the measured timings so each platform's margin under the budget shows on every run"
)]
#[ignore = "a timing budget means something only in an optimised build, so the gate runs it on its own in release"]
async fn reads_each_sorted_and_filtered_page_of_10_000_series_within_2_ms_at_p95() {
    let trial = trial_of("a sorted and filtered page of 100 from 10,000 series");
    let folder = ScratchFolder::new("filtered-page-speed");
    let database = Database::open(&library_config(&folder)).unwrap();
    add_generated_library(&database).await;

    let mut over_budget = Vec::new();
    for sort in SORTS {
        for filter in filters() {
            let listing = SeriesListing { sort, filter };
            let outcome = trial
                .run(
                    async |_| None,
                    async |after| {
                        *after = read_page(&database, listing.clone(), after.take()).await;
                    },
                )
                .await;
            eprintln!("{listing:?}: {outcome}");
            if !outcome.is_within_budget() {
                over_budget.push(format!("{listing:?}: {outcome}"));
            }
        }
    }

    assert_eq!(over_budget, Vec::<String>::new());
}

#[tokio::test]
#[expect(
    clippy::print_stderr,
    reason = "the gate logs the measured timings so each platform's margin under the budget shows on every run"
)]
#[ignore = "a timing budget means something only in an optimised build, so the gate runs it on its own in release"]
async fn counts_the_filtered_series_of_10_000_within_2_ms_at_p95() {
    let trial = trial_of("a filtered count of 10,000 series");
    let folder = ScratchFolder::new("filtered-count-speed");
    let database = Database::open(&library_config(&folder)).unwrap();
    add_generated_library(&database).await;

    let mut over_budget = Vec::new();
    for filter in filters() {
        let outcome = trial
            .run(
                async |_| (),
                async |()| count(&database, filter.clone()).await,
            )
            .await;
        eprintln!("{filter:?}: {outcome}");
        if !outcome.is_within_budget() {
            over_budget.push(format!("{filter:?}: {outcome}"));
        }
    }

    assert_eq!(over_budget, Vec::<String>::new());
}

/// Forgotten and stored-twice series that are too many to sort on their own, all finished, beside thousands of unstarted series that hold none of them.
const CROWDED_SMART_FILTERS: [SeriesFilter; 2] = [
    SeriesFilter::NONE.with_last_read_before_ms(Some(READ_LATELY_MS)),
    SeriesFilter::NONE.with_duplicates(Inclusion::Only),
];
const EVERY_TENTH_FINISHED: u32 = 10;
const EVERY_TWENTIETH: u32 = 20;
const EVERY_TWENTIETH_REMAINDER: u32 = 0;

#[tokio::test]
#[expect(
    clippy::print_stderr,
    reason = "the gate logs the measured timings so each platform's margin under the budget shows on every run"
)]
#[ignore = "a timing budget means something only in an optimised build, so the gate runs it on its own in release"]
async fn reads_each_page_of_500_smart_matches_among_9_000_unstarted_series_within_2_ms_at_p95() {
    let trial =
        trial_of("a page of 100 of 500 finished smart matches beside 9,000 unstarted series");
    let folder = ScratchFolder::new("crowded-smart-filter-speed");
    let database = Database::open(&library_config(&folder)).unwrap();
    add_library_with_finished_smart_matches(&database).await;

    let mut over_budget = Vec::new();
    for sort in SORTS {
        for filter in CROWDED_SMART_FILTERS {
            let listing = SeriesListing { sort, filter };
            let outcome = trial
                .run(
                    async |_| None,
                    async |after| {
                        *after = read_page(&database, listing.clone(), after.take()).await;
                    },
                )
                .await;
            eprintln!("{listing:?}: {outcome}");
            if !outcome.is_within_budget() {
                over_budget.push(format!("{listing:?}: {outcome}"));
            }
        }
    }

    assert_eq!(over_budget, Vec::<String>::new());
}

/// Finishes every tenth series, and of those reads every other one long ago and stores its first book twice.
async fn add_library_with_finished_smart_matches(database: &Database) {
    add_generated_series(database, &BOOK_TITLES).await;
    database
        .write(|transaction| {
            transaction.execute(
                "INSERT INTO book_state (book_id, is_read)
                SELECT book.id, 1 FROM book JOIN series ON series.local_id = book.series_local_id
                WHERE series.added_at_ms % ?1 = 0",
                [EVERY_TENTH_FINISHED],
            )?;
            transaction.execute(
                "INSERT INTO reading_session (
                    book_id, started_at_ms, ended_at_ms, utc_offset_minutes, page, page_count
                )
                SELECT book.id, ?2, ?2, 0, 0, ?3
                FROM book JOIN series ON series.local_id = book.series_local_id
                WHERE series.added_at_ms % ?1 = 0 AND book.title = ?4",
                (
                    EVERY_TENTH_FINISHED,
                    READ_LONG_AGO_MS,
                    SESSION_PAGE_COUNT,
                    BOOK_TITLES[0],
                ),
            )?;
            transaction.execute(
                "UPDATE reading_session SET ended_at_ms = ?1, started_at_ms = ?1
                WHERE book_id IN (
                    SELECT book.id FROM book JOIN series ON series.local_id = book.series_local_id
                    WHERE series.added_at_ms % ?2 != ?3
                )",
                (READ_LATELY_MS, EVERY_TWENTIETH, EVERY_TWENTIETH_REMAINDER),
            )?;
            store_first_books_twice(transaction, EVERY_TWENTIETH, EVERY_TWENTIETH_REMAINDER)?;
            Ok(())
        })
        .await
        .unwrap();
}

fn trial_of(measured: &'static str) -> SpeedTrial {
    SpeedTrial {
        measured,
        sampling: Sampling::Repeated {
            samples: NonZeroUsize::new(SAMPLES).unwrap(),
            statistic: Statistic::Percentile95,
        },
        budget: TimingBudget::from_env(BUDGET),
    }
}

async fn add_generated_library(database: &Database) {
    add_generated_series(database, &BOOK_TITLES).await;
    database
        .write(|transaction| {
            transaction.execute(
                "INSERT INTO book_state (book_id, is_read)
                SELECT book.id, 1 FROM book JOIN series ON series.local_id = book.series_local_id
                WHERE series.added_at_ms % ?1 = 0
                    OR (series.added_at_ms % ?2 = 0 AND book.title = ?3)",
                (
                    EVERY_HUNDREDTH_FINISHED,
                    EVERY_TENTH_STARTED,
                    BOOK_TITLES[0],
                ),
            )?;
            transaction.execute(
                "INSERT INTO reading_session (
                    book_id, started_at_ms, ended_at_ms, utc_offset_minutes, page, page_count
                )
                SELECT book.id, ended_at_ms, ended_at_ms, 0, 0, ?1
                FROM (
                    SELECT book.id, CASE WHEN series.added_at_ms % ?2 = ?3 THEN ?4 ELSE ?5 END
                        AS ended_at_ms
                    FROM book JOIN series ON series.local_id = book.series_local_id
                    WHERE book.title = ?6
                ) AS book",
                (
                    SESSION_PAGE_COUNT,
                    EVERY_HUNDREDTH_FORGOTTEN,
                    FORGOTTEN_REMAINDER,
                    READ_LONG_AGO_MS,
                    READ_LATELY_MS,
                    BOOK_TITLES[0],
                ),
            )?;
            store_first_books_twice(transaction, EVERY_HUNDREDTH_COPIED, COPIED_REMAINDER)?;
            transaction.execute(
                "UPDATE series SET language = ?3, language_source = 'files'
                WHERE added_at_ms % ?1 = ?2",
                (
                    EVERY_HUNDREDTH_IN_A_RARE_LANGUAGE,
                    RARE_LANGUAGE_REMAINDER,
                    RARE_LANGUAGE,
                ),
            )?;
            transaction.execute(
                "UPDATE series SET adult_rated_books = 1 WHERE added_at_ms % ?1 = ?2",
                (EVERY_HUNDREDTH_RATED_ADULT, RATED_ADULT_REMAINDER),
            )?;
            Ok(())
        })
        .await
        .unwrap();
}

fn store_first_books_twice(
    transaction: &Transaction<'_>,
    every: u32,
    remainder: u32,
) -> rusqlite::Result<()> {
    transaction.execute(
        "INSERT INTO library_root (kind, locator_kind, location, added_at_ms)
        VALUES ('linked', 'path', ?1, 0)",
        [COPIES_FOLDER],
    )?;
    transaction.execute(
        "INSERT INTO book_file (book_id, root_id, location, size_bytes, modified_at_ms)
        SELECT book.id, library_root.id, CAST(series.title || copy.name AS BLOB), 1, 0
        FROM book
        JOIN series ON series.local_id = book.series_local_id
        CROSS JOIN library_root
        CROSS JOIN (SELECT '/a.cbz' AS name UNION ALL SELECT '/b.cbz') AS copy
        WHERE series.added_at_ms % ?1 = ?2 AND book.title = ?3",
        (every, remainder, BOOK_TITLES[0]),
    )?;
    Ok(())
}

async fn read_page(
    database: &Database,
    listing: SeriesListing,
    after: Option<Cursor>,
) -> Option<Cursor> {
    let request = PageRequest {
        after,
        size: PageSize::try_from(PAGE_SIZE).unwrap(),
    };
    database
        .read(move |connection| series_page(connection, &listing, &request))
        .await
        .unwrap()
        .next
}

async fn count(database: &Database, filter: SeriesFilter) {
    database
        .read(move |connection| series_count(connection, &filter))
        .await
        .unwrap();
}
