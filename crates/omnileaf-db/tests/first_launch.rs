#![expect(
    clippy::unwrap_used,
    reason = "each test builds its own scratch library, so a failed set-up should stop the test"
)]

mod support;

use omnileaf_db::{
    Database,
    first_launch::{finish_first_launch, first_launch_finished},
};
use support::{ScratchFolder, library_config};

const FINISHED_AT_MS: i64 = 1_790_000_000_000;
const FINISHED_AGAIN_AT_MS: i64 = 1_790_000_060_000;

async fn is_finished(database: &Database) -> bool {
    database.read(first_launch_finished).await.unwrap()
}

async fn finish(database: &Database, finished_at_ms: i64) {
    database
        .write(move |transaction| finish_first_launch(transaction, finished_at_ms))
        .await
        .unwrap();
}

#[tokio::test]
async fn a_new_library_has_not_finished_its_first_launch() {
    let folder = ScratchFolder::new("first-launch-new");

    let database = Database::open(&library_config(&folder)).unwrap();

    assert!(!is_finished(&database).await);
}

#[tokio::test]
async fn remembers_the_first_launch_finished_after_the_library_reopens() {
    let folder = ScratchFolder::new("first-launch-reopen");
    finish(
        &Database::open(&library_config(&folder)).unwrap(),
        FINISHED_AT_MS,
    )
    .await;

    let reopened = Database::open(&library_config(&folder)).unwrap();

    assert!(is_finished(&reopened).await);
}

#[tokio::test]
async fn stays_finished_when_finished_again() {
    let folder = ScratchFolder::new("first-launch-again");
    let database = Database::open(&library_config(&folder)).unwrap();
    finish(&database, FINISHED_AT_MS).await;

    finish(&database, FINISHED_AGAIN_AT_MS).await;

    assert!(is_finished(&database).await);
}
