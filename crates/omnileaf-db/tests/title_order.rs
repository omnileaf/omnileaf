#![expect(
    clippy::unwrap_used,
    reason = "each test builds its own scratch library, so a failed set-up should stop the test"
)]

mod library_seed;
mod support;

use library_seed::{SeriesSeed, seed_library};
use omnileaf_db::{
    Connection, Database,
    catalog::{NewSeries, PageRequest, PageSize, SeriesOrder, series_page},
};
use support::ScratchFolder;

const ONE_BOOK: &[&str] = &["Volume 01"];
const PAGE_SIZE: u16 = 3;
const UNSORTED: [&str; 5] = [
    "Echo Sample",
    "Delta Sample",
    "Charlie Sample",
    "Bravo Sample",
    "Alpha Sample",
];

struct Library {
    database: Database,
    _folder: ScratchFolder,
}

impl Library {
    async fn with_titles(name: &str, titles: &[&str]) -> Self {
        let folder = ScratchFolder::new(name);
        seed(&folder, titles).await;
        Self::reopen(folder)
    }

    fn reopen(folder: ScratchFolder) -> Self {
        Self {
            database: Database::open(&folder.config()).unwrap(),
            _folder: folder,
        }
    }

    async fn titles(&self) -> Vec<String> {
        let mut titles = Vec::new();
        let mut after = None;
        loop {
            let request = PageRequest {
                after,
                size: PageSize::try_from(PAGE_SIZE).unwrap(),
            };
            let page = self
                .database
                .read(move |connection| series_page(connection, SeriesOrder::Title, &request))
                .await
                .unwrap();
            titles.extend(page.items.into_iter().map(|series| series.title));
            match page.next {
                Some(next) => after = Some(next),
                None => return titles,
            }
        }
    }
}

#[tokio::test]
async fn orders_titles_as_readers_expect_by_default() {
    let library = Library::with_titles(
        "root-order",
        &[
            "Zebra Sample",
            "Vol. 10",
            "...Sample Dots",
            "Ｆｕｌｌ Sample 12",
            "Vol. 2",
            "Ärger Sample",
            "\u{200f}Yonder Sample",
            "Full Sample 3",
            "Apple Sample",
        ],
    )
    .await;

    let titles = library.titles().await;

    assert_eq!(
        titles,
        [
            "Apple Sample",
            "Ärger Sample",
            "Full Sample 3",
            "Ｆｕｌｌ Sample 12",
            "...Sample Dots",
            "Vol. 2",
            "Vol. 10",
            "\u{200f}Yonder Sample",
            "Zebra Sample",
        ]
    );
}

#[tokio::test]
async fn orders_titles_differing_only_in_punctuation_by_their_text_rather_than_their_ids() {
    let spaced = "Sample Man";
    let hyphenated = "Sample-Man";
    let library = Library::with_titles("punctuation-order", &[hyphenated, spaced]).await;

    let titles = library.titles().await;

    assert!(series_id(hyphenated) < series_id(spaced));
    assert_eq!(titles, [spaced, hyphenated]);
}

#[tokio::test]
async fn keys_every_title_again_when_the_stored_keys_came_from_another_build() {
    let folder = ScratchFolder::new("rekey-other-build");
    seed(&folder, &UNSORTED).await;
    tamper(
        &folder,
        "UPDATE series SET title_key = x'00'; UPDATE title_key_stamp SET stamp = zeroblob(16);",
    );

    let library = Library::reopen(folder);

    let mut expected = UNSORTED;
    expected.sort_unstable();
    assert_eq!(library.titles().await, expected);
}

#[tokio::test]
async fn leaves_the_keys_alone_when_they_carry_this_build_s_stamp() {
    let folder = ScratchFolder::new("rekey-same-build");
    seed(&folder, &UNSORTED).await;
    tamper(&folder, "UPDATE series SET title_key = x'00';");

    let library = Library::reopen(folder);

    let mut expected = UNSORTED;
    expected.sort_by_key(|title| series_id(title));
    assert_eq!(library.titles().await, expected);
}

async fn seed(folder: &ScratchFolder, titles: &[&str]) {
    let database = Database::open(&folder.config()).unwrap();
    let series: Vec<SeriesSeed<'_>> = titles.iter().map(|title| (*title, 1, ONE_BOOK)).collect();
    seed_library(&database, &series).await;
}

fn tamper(folder: &ScratchFolder, sql: &str) {
    Connection::open(folder.config().path)
        .unwrap()
        .execute_batch(sql)
        .unwrap();
}

fn series_id(folder_name: &str) -> [u8; 16] {
    *NewSeries::local(folder_name, 0).unwrap().id().as_bytes()
}
