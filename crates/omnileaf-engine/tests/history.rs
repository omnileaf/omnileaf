#![expect(
    clippy::unwrap_used,
    reason = "each test opens its own library in a scratch folder, so a failed set-up should stop the test"
)]

#[expect(
    dead_code,
    reason = "these tests need scratch folders but none of the files support can put in them"
)]
mod support;

use omnileaf_engine::{Library, LocalDay};
use support::{FixedClock, ScratchFolder};

const SOME_MONDAY: LocalDay = LocalDay(20_717);

async fn empty_library(name: &str) -> (Library, ScratchFolder) {
    let home = ScratchFolder::new(name);
    let library = Library::open(home.path().to_path_buf(), FixedClock)
        .await
        .unwrap();
    (library, home)
}

#[tokio::test]
async fn lists_no_history_before_anything_is_read() {
    let (library, _home) = empty_library("history-empty").await;

    let page = library.history(None).await.unwrap();

    assert_eq!((page.entries, page.next), (Vec::new(), None));
}

#[tokio::test]
async fn counts_no_time_read_before_anything_is_read() {
    let (library, _home) = empty_library("history-no-time").await;

    let read_seconds = library.reading_time_since(SOME_MONDAY).await.unwrap();

    assert_eq!(read_seconds, 0);
}
