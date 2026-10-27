#![expect(
    clippy::unwrap_used,
    reason = "each test builds its own scratch library, so a failed set-up should stop the test"
)]

mod support;

use omnileaf_db::{
    Database,
    hidden_file_types::{hidden_file_types, hide_file_type, show_file_type},
};
use support::{ScratchFolder, library_config};

fn opened(name: &str) -> (Database, ScratchFolder) {
    let folder = ScratchFolder::new(name);
    let database = Database::open(&library_config(&folder)).unwrap();
    (database, folder)
}

async fn hidden(database: &Database) -> Vec<String> {
    database.read(hidden_file_types).await.unwrap()
}

async fn hide(database: &Database, file_type: &'static str) {
    database
        .write(move |transaction| hide_file_type(transaction, file_type))
        .await
        .unwrap();
}

#[tokio::test]
async fn a_new_library_hides_no_file_types() {
    let (database, _folder) = opened("hidden-types-new");

    let types = hidden(&database).await;

    assert_eq!(types, Vec::<String>::new());
}

#[tokio::test]
async fn keeps_each_type_hidden_once_in_order() {
    let (database, _folder) = opened("hidden-types-kept");
    for file_type in ["pdf", "cbr", "pdf"] {
        hide(&database, file_type).await;
    }

    let types = hidden(&database).await;

    assert_eq!(types, ["cbr", "pdf"]);
}

#[tokio::test]
async fn shows_a_hidden_type_again() {
    let (database, _folder) = opened("hidden-types-shown");
    hide(&database, "cbr").await;
    hide(&database, "pdf").await;

    database
        .write(|transaction| show_file_type(transaction, "cbr"))
        .await
        .unwrap();

    assert_eq!(hidden(&database).await, ["pdf"]);
}

#[tokio::test]
async fn refuses_a_file_type_not_in_lowercase() {
    let (database, _folder) = opened("hidden-types-case");

    let hidden = database
        .write(|transaction| hide_file_type(transaction, "CBR"))
        .await;

    assert!(hidden.is_err());
}
