#![expect(
    clippy::unwrap_used,
    reason = "the test builds its own scratch library, so a failed set-up should stop it"
)]

mod library_seed;
mod speed;
mod support;

use std::{mem, num::NonZeroUsize, time::Duration};

use library_seed::{SeriesSeed, seed_library};
use omnileaf_db::{
    Database,
    adult_content::AdultHiding,
    catalog::{
        Cursor, Inclusion, PageRequest, PageSize, SearchText, SeriesFilter, SeriesSearch,
        closest_chapter_title, closest_title_words, search_chapters, search_chapters_count,
        search_count, search_page,
    },
};
use omnileaf_testkit::{Sampling, SpeedTrial, Statistic, TimingBudget};
use speed::add_generated_series;
use support::{ScratchFolder, library_config};

const BOOK_TITLES: [&str; 10] = [
    "Volume 01",
    "Volume 02",
    "Volume 03",
    "Volume 04",
    "Volume 05",
    "Chapter 12",
    "Chapter 120",
    "Special",
    "Side Story 3",
    "Extra",
];
const EVERY_TENTH_BOOK_TITLED_IN_COMIC_INFO: u32 = 10;
const EVERY_HUNDREDTH_FINISHED: u32 = 100;
const PAGE_SIZE: u16 = 50;
const SAMPLES: usize = 40;
const BUDGET: Duration = Duration::from_millis(10);

const GENRES: u32 = 50;
const EVERY_TWENTIETH_CREDITED: u32 = 20;
const EVERY_FIVE_HUNDREDTH_BOOKMARKED: u32 = 500;
const LONE_TAG: &str = "Lone Tag";
const SERIES_HOLDING_THE_LONE_TAG: u32 = 7_777;

const LONG_SERIES: &str = "Long Series";
const LONG_TAG: &str = "Long Tag";
const LONG_SERIES_ADDED_AT_MS: i64 = 20_000;
const LONG_SERIES_BOOKS: u32 = 1_500;
const LONG_SERIES_VOLUMES: u32 = 1_000;
const SORTS_AFTER_VOLUMES: &str = "Zeta";

const CHAPTER_TEXTS: [&str; 6] = [
    "volume",
    "chapter",
    "volume 1",
    "chapter 12",
    "special",
    "harbor gate",
];

const TEXTS: [&str; 17] = [
    "sample",
    "sample series",
    "series 09",
    "series 091",
    "09123",
    "lantern",
    "s",
    "12",
    "zz",
    "writer",
    "writer 091",
    "genre 7",
    "volume",
    "chapter",
    "volume 1",
    "chapter 12",
    "special",
];

const LONG_SPELLING_SERIES: &str = "The Long And Winding Chronicles Of The Lantern Keepers";

const MISSPELT_TEXTS: [&str; 6] = [
    "volmue",
    "chaptr 12",
    "harbor gat",
    "harbr gate 5",
    "smaple sereis",
    "the long and windng chronicels of the lantern",
];

const TEXT_CLOSE_TO_NOTHING: &str = "quixotic zebra";

const HIDING_ADULT: AdultHiding = AdultHiding {
    leaves_out_adult: true,
    counts_age_ratings: true,
};

#[derive(Clone, Copy, Debug)]
enum Arm {
    Series,
    Chapter,
}

/// No filter, and one that lets through a hundredth of the library, so a search reads furthest to fill a page.
const FILTERS: [SeriesFilter; 2] = [
    SeriesFilter::NONE,
    SeriesFilter::NONE.with_finished(Inclusion::Only),
];

fn chapter_filters() -> Vec<SeriesFilter> {
    vec![
        SeriesFilter::NONE,
        SeriesFilter::NONE.with_finished(Inclusion::Only),
        SeriesFilter::NONE.with_adult(Inclusion::Hide, true),
        SeriesFilter::NONE.with_tags(vec!["Genre 7".to_owned()]),
        SeriesFilter::NONE.with_bookmarked(Inclusion::Only),
        SeriesFilter::NONE.with_tags(vec![LONE_TAG.to_owned()]),
        SeriesFilter::NONE.with_tags(vec![LONG_TAG.to_owned()]),
        SeriesFilter::NONE
            .with_tags(vec![LONG_TAG.to_owned()])
            .with_adult(Inclusion::Hide, true),
    ]
}

#[derive(Clone, Copy)]
enum Target {
    Series,
    Chapters,
}

impl Target {
    const ALL: [Self; 2] = [Self::Series, Self::Chapters];

    const fn name(self) -> &'static str {
        match self {
            Self::Series => "series",
            Self::Chapters => "chapters",
        }
    }

    fn texts(self) -> &'static [&'static str] {
        match self {
            Self::Series => &TEXTS,
            Self::Chapters => &CHAPTER_TEXTS,
        }
    }

    fn filters(self) -> Vec<SeriesFilter> {
        match self {
            Self::Series => FILTERS.to_vec(),
            Self::Chapters => chapter_filters(),
        }
    }
}

enum Read {
    FirstPage,
    PageAfter(Cursor),
    Count,
}

#[tokio::test]
#[expect(
    clippy::print_stderr,
    reason = "the gate logs the measured timings so each platform's margin under the budget shows on every run"
)]
#[ignore = "a timing budget means something only in an optimised build, so the gate runs it on its own in release"]
async fn searches_10_000_series_within_10_ms_at_p95() {
    let trial = SpeedTrial {
        measured: "a search of 10,000 series",
        sampling: Sampling::Repeated {
            samples: NonZeroUsize::new(SAMPLES).unwrap(),
            statistic: Statistic::Percentile95,
        },
        budget: TimingBudget::from_env(BUDGET),
    };
    let folder = ScratchFolder::new("search-speed");
    let database = Database::open(&library_config(&folder)).unwrap();
    add_generated_library(&database).await;

    let mut over_budget = Vec::new();
    for target in Target::ALL {
        for text in target.texts() {
            for filter in target.filters() {
                let search = SeriesSearch {
                    text: SearchText::parse(text).unwrap().unwrap(),
                    filter: filter.clone(),
                };
                let outcome = trial
                    .run(
                        async |_| Read::FirstPage,
                        async |next| {
                            *next =
                                read(&database, target, &search, mem::replace(next, Read::Count))
                                    .await;
                        },
                    )
                    .await;
                let line = format!(
                    "{} of {text:?} through {filter:?}: {outcome}",
                    target.name()
                );
                eprintln!("{line}");
                if !outcome.is_within_budget() {
                    over_budget.push(line);
                }
            }
        }
    }

    over_budget.extend(time_spellings(&database).await);

    assert_eq!(over_budget, Vec::<String>::new());
}

fn long_series_title(number: u32) -> String {
    if number <= LONG_SERIES_VOLUMES {
        format!("Volume {number:04}")
    } else {
        format!("{SORTS_AFTER_VOLUMES} Harbor Gate {number:04}")
    }
}

async fn add_long_series(database: &Database) {
    let titles: Vec<String> = (1..=LONG_SERIES_BOOKS).map(long_series_title).collect();
    let titles: Vec<&str> = titles.iter().map(String::as_str).collect();
    seed_library(
        database,
        &[SeriesSeed {
            added_at_ms: LONG_SERIES_ADDED_AT_MS,
            book_titles: &titles,
            ..SeriesSeed::named(LONG_SERIES)
        }],
    )
    .await;
}

#[expect(
    clippy::print_stderr,
    reason = "the gate logs the measured timings so each platform's margin under the budget shows on every run"
)]
async fn time_spellings(database: &Database) -> Vec<String> {
    let trial = SpeedTrial {
        measured: "a spelling suggestion over 100,000 books",
        sampling: Sampling::Repeated {
            samples: NonZeroUsize::new(SAMPLES).unwrap(),
            statistic: Statistic::Percentile95,
        },
        budget: TimingBudget::from_env(BUDGET),
    };
    let mut over_budget = Vec::new();
    for hiding in [AdultHiding::default(), HIDING_ADULT] {
        assert_spellings_found(database, hiding).await;
        for text in MISSPELT_TEXTS.into_iter().chain([TEXT_CLOSE_TO_NOTHING]) {
            for arm in [Arm::Series, Arm::Chapter] {
                let outcome = trial
                    .run(
                        async |_| (),
                        async |()| {
                            suggest(database, arm, text, hiding).await;
                        },
                    )
                    .await;
                let case = format!("spelling {text:?} by {arm:?} while {hiding:?}");
                eprintln!("{case}: {outcome}");
                if !outcome.is_within_budget() {
                    over_budget.push(format!("{case}: {outcome}"));
                }
            }
        }
    }
    over_budget
}

async fn assert_spellings_found(database: &Database, hiding: AdultHiding) {
    for text in MISSPELT_TEXTS {
        let found = [
            suggest(database, Arm::Series, text, hiding).await,
            suggest(database, Arm::Chapter, text, hiding).await,
        ];
        assert!(found.contains(&true), "{text:?} found no spelling");
    }
    let found = [
        suggest(database, Arm::Series, TEXT_CLOSE_TO_NOTHING, hiding).await,
        suggest(database, Arm::Chapter, TEXT_CLOSE_TO_NOTHING, hiding).await,
    ];
    assert_eq!(found, [false, false]);
}

async fn suggest(database: &Database, arm: Arm, text: &'static str, hiding: AdultHiding) -> bool {
    database
        .read(move |connection| match arm {
            Arm::Series => Ok(closest_title_words(connection, text, hiding)?.is_some()),
            Arm::Chapter => Ok(closest_chapter_title(connection, text, hiding)?.is_some()),
        })
        .await
        .unwrap()
}

async fn add_generated_library(database: &Database) {
    add_long_series(database).await;
    seed_library(database, &[SeriesSeed::named(LONG_SPELLING_SERIES)]).await;
    add_generated_series(database, &BOOK_TITLES).await;
    database
        .write(|transaction| {
            transaction.execute(
                "INSERT INTO book_state (book_id, is_read)
                SELECT book.id, 1 FROM book JOIN series ON series.local_id = book.series_local_id
                WHERE series.added_at_ms % ?1 = 0",
                [EVERY_HUNDREDTH_FINISHED],
            )?;
            transaction.execute(
                "INSERT INTO book_details (book_id, title)
                SELECT ranked.id,
                    CASE WHEN ranked.position = 1 + ranked.added_at_ms % ?1
                        THEN 'Harbor Gate ' || ranked.added_at_ms END
                FROM (
                    SELECT book.id, series.added_at_ms,
                        row_number() OVER (
                            PARTITION BY book.series_local_id ORDER BY book.reading_order_key
                        ) AS position
                    FROM book JOIN series ON series.local_id = book.series_local_id
                ) AS ranked",
                [EVERY_TENTH_BOOK_TITLED_IN_COMIC_INFO],
            )?;
            transaction.execute(
                "INSERT INTO book_person (book_id, role, name)
                SELECT book.id, 'writer', 'Writer ' || series.added_at_ms
                FROM book JOIN series ON series.local_id = book.series_local_id
                WHERE series.added_at_ms % ?1 = 0",
                [EVERY_TWENTIETH_CREDITED],
            )?;
            transaction.execute(
                "INSERT INTO book_bookmark (book_id, page)
                SELECT book.id, 1
                FROM book JOIN series ON series.local_id = book.series_local_id
                WHERE series.added_at_ms % ?1 = 0",
                [EVERY_FIVE_HUNDREDTH_BOOKMARKED],
            )?;
            transaction.execute(
                "INSERT INTO book_tag (book_id, kind, name)
                SELECT book.id, 'tag', 'Genre ' || (series.added_at_ms % ?1)
                FROM book JOIN series ON series.local_id = book.series_local_id",
                [GENRES],
            )?;
            transaction.execute(
                "INSERT INTO book_tag (book_id, kind, name)
                SELECT book.id, 'tag', ?1
                FROM book JOIN series ON series.local_id = book.series_local_id
                WHERE series.added_at_ms = ?2",
                (LONE_TAG, SERIES_HOLDING_THE_LONE_TAG),
            )?;
            transaction.execute(
                "INSERT INTO book_tag (book_id, kind, name)
                SELECT book.id, 'tag', ?1
                FROM book JOIN series ON series.local_id = book.series_local_id
                WHERE series.added_at_ms = ?2",
                (LONG_TAG, LONG_SERIES_ADDED_AT_MS),
            )?;
            Ok(())
        })
        .await
        .unwrap();
}

async fn read(database: &Database, target: Target, search: &SeriesSearch, step: Read) -> Read {
    let search = search.clone();
    match step {
        Read::FirstPage => page(database, target, search, None)
            .await
            .map_or(Read::Count, Read::PageAfter),
        Read::PageAfter(after) => {
            page(database, target, search, Some(after)).await;
            Read::Count
        }
        Read::Count => {
            count(database, target, search).await;
            Read::FirstPage
        }
    }
}

async fn page(
    database: &Database,
    target: Target,
    search: SeriesSearch,
    after: Option<Cursor>,
) -> Option<Cursor> {
    let request = PageRequest {
        after,
        size: PageSize::try_from(PAGE_SIZE).unwrap(),
    };
    database
        .read(move |connection| match target {
            Target::Series => search_page(connection, &search, &request).map(|page| page.next),
            Target::Chapters => {
                search_chapters(connection, &search, &request).map(|page| page.next)
            }
        })
        .await
        .unwrap()
}

async fn count(database: &Database, target: Target, search: SeriesSearch) {
    database
        .read(move |connection| match target {
            Target::Series => search_count(connection, &search).map(drop),
            Target::Chapters => search_chapters_count(connection, &search).map(drop),
        })
        .await
        .unwrap();
}
