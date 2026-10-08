#![expect(
    clippy::unwrap_used,
    reason = "each test builds its own scratch library, so a failed set-up should stop the test"
)]

mod library_seed;
mod support;

use library_seed::{SeriesSeed, seed_library};
use omnileaf_db::{
    Connection, Database, Error,
    catalog::{Cursor, NewSeries, Page, PageRequest, PageSize, SeriesOrder, series_page},
    store::{Changed, Clock, Store},
};
use support::ScratchFolder;

const PAGE_SIZE: u16 = 3;
const UNSORTED: [&str; 5] = [
    "Echo Sample",
    "Delta Sample",
    "Charlie Sample",
    "Bravo Sample",
    "Alpha Sample",
];

struct StoppedClock;

impl Clock for StoppedClock {
    fn now_unix_ms(&self) -> u64 {
        0
    }
}

struct Library {
    store: Store,
    _folder: ScratchFolder,
}

impl Library {
    async fn with_titles(name: &str, titles: &[&str]) -> Self {
        let folder = ScratchFolder::new(name);
        seed(&folder, titles).await;
        Self::reopen(folder)
    }

    fn reopen(folder: ScratchFolder) -> Self {
        let database = Database::open(&folder.config()).unwrap();
        Self {
            store: Store::new(database, StoppedClock),
            _folder: folder,
        }
    }

    async fn sorted_for(language: &str, titles: &[&str]) -> Vec<String> {
        let library = Self::with_titles(&format!("sorted-for-{language}"), titles).await;
        library
            .store
            .sort_titles_for(language.parse().unwrap())
            .await
            .unwrap();
        library.titles().await
    }

    async fn titles(&self) -> Vec<String> {
        self.titles_after(None).await
    }

    /// Passes every cursor through its text form, as one crossing to the interface would.
    async fn titles_after(&self, mut after: Option<Cursor>) -> Vec<String> {
        let mut titles = Vec::new();
        loop {
            let page = self.page(after, PAGE_SIZE).await;
            titles.extend(page.items);
            match page.next {
                Some(next) => after = Some(next.to_string().parse().unwrap()),
                None => return titles,
            }
        }
    }

    async fn page(&self, after: Option<Cursor>, size: u16) -> Page<String> {
        self.try_page(after, size).await.unwrap()
    }

    async fn try_page(&self, after: Option<Cursor>, size: u16) -> Result<Page<String>, Error> {
        let request = PageRequest {
            after,
            size: PageSize::try_from(size).unwrap(),
        };
        let page = self
            .store
            .database()
            .read(move |connection| series_page(connection, SeriesOrder::Title, &request))
            .await?;
        Ok(Page {
            items: page.items.into_iter().map(|series| series.title).collect(),
            next: page.next,
        })
    }
}

#[tokio::test]
async fn carries_an_open_cursor_on_from_its_series_new_place_once_the_titles_are_keyed_again() {
    let library = Library::with_titles(
        "cursor-rekeyed",
        &["Zebra", "Ödla", "Bok", "Åsna", "Apelsin"],
    )
    .await;
    let first = library.page(None, 2).await;
    library
        .store
        .sort_titles_for("sv".parse().unwrap())
        .await
        .unwrap();

    let rest = library.titles_after(first.next).await;

    assert_eq!(first.items, ["Apelsin", "Åsna"]);
    assert_eq!(rest, ["Ödla"]);
}

#[tokio::test]
async fn refuses_an_open_cursor_whose_series_went_before_the_titles_were_keyed_again() {
    let library = Library::with_titles("cursor-series-gone", &["Bok", "Åsna", "Apelsin"]).await;
    let first = library.page(None, 2).await;
    library
        .store
        .database()
        .write(
            |transaction| Ok(transaction.execute("DELETE FROM series WHERE title = 'Åsna'", [])?),
        )
        .await
        .unwrap();
    library
        .store
        .sort_titles_for("sv".parse().unwrap())
        .await
        .unwrap();

    let outcome = library.try_page(first.next, PAGE_SIZE).await;

    assert!(matches!(outcome, Err(Error::StaleCursor)), "{outcome:?}");
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
async fn orders_english_titles_by_number_and_without_their_leading_article() {
    let titles = Library::sorted_for(
        "en",
        &[
            "The Zebra",
            "Vol. 10",
            "An Apple",
            "Ｆｕｌｌ 12",
            "The",
            "Vol. 2",
            "Full 3",
            "Mango",
        ],
    )
    .await;

    assert_eq!(
        titles,
        [
            "An Apple",
            "Full 3",
            "Ｆｕｌｌ 12",
            "Mango",
            "The",
            "Vol. 2",
            "Vol. 10",
            "The Zebra",
        ]
    );
}

#[tokio::test]
async fn files_german_umlauts_with_their_base_letters() {
    let titles = Library::sorted_for(
        "de",
        &["Zebra", "Ärger", "Apfel", "Öl", "Ofen", "Die Probe", "Das"],
    )
    .await;

    assert_eq!(
        titles,
        ["Apfel", "Ärger", "Das", "Ofen", "Öl", "Die Probe", "Zebra"]
    );
}

#[tokio::test]
async fn files_swedish_letters_after_z() {
    let titles = Library::sorted_for(
        "sv",
        &["Zebra", "Ärlig", "Apelsin", "Åsna", "Ödla", "En Bok"],
    )
    .await;

    assert_eq!(
        titles,
        ["Apelsin", "En Bok", "Zebra", "Åsna", "Ärlig", "Ödla"]
    );
}

#[tokio::test]
async fn orders_french_accents_and_drops_elided_articles() {
    let titles = Library::sorted_for(
        "fr",
        &[
            "L'Exemple",
            "Le Zèbre",
            "Côté",
            "Cote",
            "Coté",
            "Côte",
            "Abricot",
        ],
    )
    .await;

    assert_eq!(
        titles,
        [
            "Abricot",
            "Cote",
            "Coté",
            "Côte",
            "Côté",
            "L'Exemple",
            "Le Zèbre"
        ]
    );
}

#[tokio::test]
async fn files_russian_yo_with_ye_and_cyrillic_before_latin() {
    let titles = Library::sorted_for("ru", &["яблоко", "Zebra", "ёж", "жук", "Apple", "ель"]).await;

    assert_eq!(titles, ["ёж", "ель", "жук", "яблоко", "Apple", "Zebra"]);
}

#[tokio::test]
async fn interleaves_japanese_hiragana_and_katakana() {
    let titles = Library::sorted_for("ja", &["かめ", "カニ", "漢字", "かい", "アメ", "あめ"]).await;

    assert_eq!(titles, ["あめ", "アメ", "かい", "カニ", "かめ", "漢字"]);
}

#[tokio::test]
async fn orders_chinese_by_pinyin() {
    let titles = Library::sorted_for("zh", &["中文", "北方", "阿姨", "上午"]).await;

    assert_eq!(titles, ["阿姨", "北方", "上午", "中文"]);
}

#[tokio::test]
async fn orders_korean_hangul_before_latin() {
    let titles = Library::sorted_for("ko", &["하늘", "Apple", "가방", "나무"]).await;

    assert_eq!(titles, ["가방", "나무", "하늘", "Apple"]);
}

#[tokio::test]
async fn orders_arabic_numbers_by_value_whatever_their_digits() {
    let titles = Library::sorted_for(
        "ar",
        &["كتاب ١٠", "Apple", "باب", "كتاب 9", "أرض", "كتاب ٢"],
    )
    .await;

    assert_eq!(
        titles,
        ["أرض", "باب", "كتاب ٢", "كتاب 9", "كتاب ١٠", "Apple"]
    );
}

#[tokio::test]
async fn orders_hebrew_ignoring_direction_marks() {
    let titles = Library::sorted_for("he", &["תפוח", "Apple", "\u{200f}גשם", "בית", "אור"]).await;

    assert_eq!(titles, ["אור", "בית", "\u{200f}גשם", "תפוח", "Apple"]);
}

#[tokio::test]
async fn lists_titles_from_inside_a_write_job() {
    let library = Library::with_titles("title-page-in-write", &["Bravo", "Alpha"]).await;
    let request = PageRequest {
        after: None,
        size: PageSize::try_from(PAGE_SIZE).unwrap(),
    };

    let page = library
        .store
        .database()
        .write(move |transaction| series_page(transaction, SeriesOrder::Title, &request))
        .await
        .unwrap();

    let titles: Vec<String> = page.items.into_iter().map(|series| series.title).collect();
    assert_eq!(titles, ["Alpha", "Bravo"]);
}

#[tokio::test]
async fn keys_a_series_added_after_a_language_change_for_that_language() {
    let library = Library::with_titles("added-after-change", &["Zebra"]).await;
    library
        .store
        .sort_titles_for("sv".parse().unwrap())
        .await
        .unwrap();

    seed_library(
        library.store.database(),
        &[SeriesSeed::named("Åsna"), SeriesSeed::named("Apelsin")],
    )
    .await;

    assert_eq!(library.titles().await, ["Apelsin", "Zebra", "Åsna"]);
}

#[tokio::test]
async fn announces_the_new_title_order_once_the_titles_are_keyed_again() {
    let library = Library::with_titles("announce-order", &UNSORTED).await;
    let mut changes = library.store.subscribe();

    library
        .store
        .sort_titles_for("sv".parse().unwrap())
        .await
        .unwrap();

    assert_eq!(changes.try_recv(), Ok(Changed::TitleOrder));
}

#[tokio::test]
async fn announces_nothing_when_the_titles_are_keyed_for_the_language_already() {
    let library = Library::with_titles("announce-nothing", &UNSORTED).await;
    library
        .store
        .sort_titles_for("sv".parse().unwrap())
        .await
        .unwrap();
    let mut changes = library.store.subscribe();

    library
        .store
        .sort_titles_for("sv".parse().unwrap())
        .await
        .unwrap();

    assert!(changes.try_recv().is_err());
}

#[tokio::test]
async fn keeps_sorting_for_the_last_language_when_the_library_opens_again() {
    let folder = ScratchFolder::new("language-kept");
    seed(&folder, &["Zebra", "Åsna", "Apelsin"]).await;
    let library = Library::reopen(folder);
    library
        .store
        .sort_titles_for("sv".parse().unwrap())
        .await
        .unwrap();
    let Library {
        store,
        _folder: folder,
    } = library;
    drop(store);

    let library = Library::reopen(folder);

    assert_eq!(library.titles().await, ["Apelsin", "Zebra", "Åsna"]);
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
    let series: Vec<SeriesSeed<'_>> = titles.iter().copied().map(SeriesSeed::named).collect();
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
