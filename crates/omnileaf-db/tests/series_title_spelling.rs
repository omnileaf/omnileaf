#![expect(
    clippy::unwrap_used,
    reason = "each test builds its own scratch library, so a failed set-up should stop the test"
)]

mod library_seed;
mod support;

use library_seed::{SeriesSeed, seed_library};
use omnileaf_db::{Database, adult_content::AdultHiding, catalog::closest_title_words};
use support::{ScratchFolder, library_config};

const MORE_SERIES_THAN_THE_WINDOW_HOLDS: u32 = 300;
const CROWD_PER_TRIGRAM: u32 = 60;
const FIRST_CROWD: u32 = 100;
const HIDING: AdultHiding = AdultHiding {
    leaves_out_adult: true,
    counts_age_ratings: true,
};

struct Library {
    database: Database,
    _folder: ScratchFolder,
}

impl Library {
    async fn with(name: &str, titles: &[String]) -> Self {
        let folder = ScratchFolder::new(name);
        let database = Database::open(&library_config(&folder)).unwrap();
        let series: Vec<SeriesSeed<'_>> = titles
            .iter()
            .map(|title| SeriesSeed::named(title))
            .collect();
        seed_library(&database, &series).await;
        Self {
            database,
            _folder: folder,
        }
    }

    async fn closest(&self, text: &str) -> Option<String> {
        self.closest_while(text, AdultHiding::default()).await
    }

    async fn closest_while(&self, text: &str, hiding: AdultHiding) -> Option<String> {
        let text = text.to_owned();
        self.database
            .read(move |connection| closest_title_words(connection, &text, hiding))
            .await
            .unwrap()
    }

    async fn mark_adult(&self, title: &str) {
        let title = title.to_owned();
        self.database
            .write(move |transaction| {
                transaction.execute(
                    "UPDATE series SET adult_rated_books = 1, marked_adult = 1 WHERE title = ?1",
                    [title],
                )?;
                Ok(())
            })
            .await
            .unwrap();
    }
}

fn titles(titles: &[&str]) -> Vec<String> {
    titles.iter().map(|title| (*title).to_owned()).collect()
}

#[tokio::test]
async fn suggests_a_word_found_in_more_titles_than_the_window_holds_although_a_rarer_trigram_matches_another_title()
 {
    let mut shelf = titles(&["Holmes"]);
    shelf.extend(
        (1..=MORE_SERIES_THAN_THE_WINDOW_HOLDS).map(|number| format!("Volume {number:03}")),
    );
    let library = Library::with("series-spelling-common-and-rare", &shelf).await;

    let suggestion = library.closest("volmue").await;

    assert_eq!(suggestion.as_deref(), Some("volume"));
}

#[tokio::test]
async fn suggests_the_title_holding_two_of_the_trigrams_typed_although_crowds_of_titles_hold_one_each()
 {
    let mut shelf: Vec<String> = ["har", "arb", "rbu", "buo", "uor"]
        .iter()
        .flat_map(|trigram| {
            (1..=CROWD_PER_TRIGRAM).map(move |number| format!("{trigram} Zone {number:02}"))
        })
        .collect();
    shelf.push("Harbour".to_owned());
    let library = Library::with("series-spelling-crowded-trigrams", &shelf).await;

    let suggestion = library.closest("harbuor").await;

    assert_eq!(suggestion.as_deref(), Some("harbour"));
}

#[tokio::test]
async fn suggests_a_title_within_three_slips_of_a_long_text_although_other_titles_hold_its_rarer_trigrams()
 {
    let shelf = titles(&[
        "The Lantern Keeper",
        "Htjelantern Keeper",
        "Th Elxnter Nkeeper",
        "The Lantenr Keeepr",
    ]);
    let library = Library::with("series-spelling-long-text", &shelf).await;

    let suggestion = library.closest("the lanter nkereer").await;

    assert_eq!(suggestion.as_deref(), Some("the lantern keeper"));
}

#[tokio::test]
async fn suggests_the_title_with_the_lower_id_among_equally_near_ones() {
    let added_first = Library::with(
        "series-spelling-tie-first",
        &titles(&["Lantrenx", "Lantern"]),
    )
    .await;
    let added_second = Library::with(
        "series-spelling-tie-second",
        &titles(&["Lantern", "Lantrenx"]),
    )
    .await;

    let suggestions = (
        added_first.closest("lantren").await,
        added_second.closest("lantren").await,
    );

    assert_eq!(
        suggestions,
        (Some("lantrenx".to_owned()), Some("lantern".to_owned()))
    );
}

fn two_crowds_with_the_near_title_last(second_crowd: u32) -> Vec<String> {
    let mut shelf: Vec<String> = (1..=FIRST_CROWD)
        .map(|number| format!("qwert {number:03}"))
        .collect();
    shelf.extend((1..=second_crowd).map(|number| format!("xrtyuiopaxxx {number:03}")));
    shelf.push("qwetyuiopa".to_owned());
    shelf
}

fn two_crowds_with_the_near_title_between(second_crowd: u32) -> Vec<String> {
    let mut shelf: Vec<String> = (1..=FIRST_CROWD)
        .map(|number| format!("qwert {number:03}"))
        .collect();
    shelf.push("qwertyuiopb".to_owned());
    shelf.extend((1..=second_crowd).map(|number| format!("xrtyuiopaxxx {number:03}")));
    shelf
}

#[tokio::test]
async fn suggests_a_title_after_overlapping_crowds_that_hold_fewer_than_the_window_in_all() {
    let shelf = two_crowds_with_the_near_title_last(50);
    let library = Library::with("series-spelling-overlap", &shelf).await;

    let suggestion = library.closest("qwertyuiopa").await;

    assert_eq!(suggestion.as_deref(), Some("qwetyuiopa"));
}

#[tokio::test]
async fn suggests_the_199th_matching_title_of_overlapping_crowds() {
    let shelf = two_crowds_with_the_near_title_last(98);
    let library = Library::with("series-spelling-just-under", &shelf).await;

    let suggestion = library.closest("qwertyuiopa").await;

    assert_eq!(suggestion.as_deref(), Some("qwetyuiopa"));
}

#[tokio::test]
async fn suggests_a_title_among_the_first_200_of_201_matching_titles_by_a_four_gram_of_the_text() {
    let shelf = two_crowds_with_the_near_title_between(100);
    let library = Library::with("series-spelling-just-over", &shelf).await;

    let suggestion = library.closest("qwertyuiopa").await;

    assert_eq!(suggestion.as_deref(), Some("qwertyuiopb"));
}

#[tokio::test]
async fn suggests_a_visible_title_although_its_rarest_trigrams_are_in_a_hidden_series_only() {
    let mut shelf: Vec<String> = (1..=5)
        .map(|number| format!("Lantern Keeper {number}"))
        .collect();
    shelf.push("Lantren Keeper Redux".to_owned());
    let library = Library::with("series-spelling-hidden-rarest", &shelf).await;
    library.mark_adult("Lantren Keeper Redux").await;

    let suggestion = library.closest_while("lantren keeper", HIDING).await;

    assert_eq!(suggestion.as_deref(), Some("lantern keeper"));
}
