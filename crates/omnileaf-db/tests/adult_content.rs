#![expect(
    clippy::unwrap_used,
    reason = "each test builds its own scratch library, so a failed set-up should stop the test"
)]

mod support;

use omnileaf_db::{
    Database,
    adult_content::{AdultTreatment, StoredAdultContent, adult_content, set_adult_content},
};
use support::{ScratchFolder, library_config};

const BLURRED_BY_HAND: StoredAdultContent = StoredAdultContent {
    treatment: AdultTreatment::Blur,
    counts_age_ratings: false,
};

const HIDDEN_BY_RATING: StoredAdultContent = StoredAdultContent {
    treatment: AdultTreatment::Hide,
    counts_age_ratings: true,
};

async fn stored(database: &Database) -> Option<StoredAdultContent> {
    database.read(adult_content).await.unwrap()
}

async fn set(database: &Database, content: StoredAdultContent) {
    database
        .write(move |transaction| set_adult_content(transaction, &content))
        .await
        .unwrap();
}

#[tokio::test]
async fn a_new_library_has_no_choice_for_adult_content_stored() {
    let folder = ScratchFolder::new("adult-content-new");

    let database = Database::open(&library_config(&folder)).unwrap();

    assert_eq!(stored(&database).await, None);
}

#[tokio::test]
async fn remembers_the_choice_for_adult_content_after_the_library_reopens() {
    let folder = ScratchFolder::new("adult-content-reopen");
    set(
        &Database::open(&library_config(&folder)).unwrap(),
        BLURRED_BY_HAND,
    )
    .await;

    let reopened = Database::open(&library_config(&folder)).unwrap();

    assert_eq!(stored(&reopened).await, Some(BLURRED_BY_HAND));
}

#[tokio::test]
async fn keeps_only_the_choice_made_last() {
    let folder = ScratchFolder::new("adult-content-again");
    let database = Database::open(&library_config(&folder)).unwrap();
    set(&database, BLURRED_BY_HAND).await;

    set(&database, HIDDEN_BY_RATING).await;

    assert_eq!(stored(&database).await, Some(HIDDEN_BY_RATING));
}

#[tokio::test]
async fn remembers_showing_adult_content() {
    let folder = ScratchFolder::new("adult-content-show");
    let database = Database::open(&library_config(&folder)).unwrap();
    let shown = StoredAdultContent {
        treatment: AdultTreatment::Show,
        ..BLURRED_BY_HAND
    };

    set(&database, shown).await;

    assert_eq!(stored(&database).await, Some(shown));
}
