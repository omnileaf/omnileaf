#![expect(
    clippy::unwrap_used,
    reason = "each test builds its own scratch library, so a failed set-up should stop the test"
)]

mod support;

use omnileaf_db::{
    Database,
    library_tabs::{StoredTab, TabPlace, library_tabs, set_library_tabs},
};
use support::{ScratchFolder, library_config};

fn shown(tab: StoredTab) -> TabPlace {
    TabPlace {
        tab,
        is_hidden: false,
    }
}

fn hidden(tab: StoredTab) -> TabPlace {
    TabPlace {
        tab,
        is_hidden: true,
    }
}

fn category(id: &str) -> StoredTab {
    StoredTab::Category(id.to_owned())
}

async fn stored(database: &Database) -> Vec<TabPlace> {
    database.read(library_tabs).await.unwrap()
}

async fn set(database: &Database, tabs: Vec<TabPlace>) {
    database
        .write(move |transaction| set_library_tabs(transaction, &tabs))
        .await
        .unwrap();
}

#[tokio::test]
async fn a_new_library_has_no_tabs_stored() {
    let folder = ScratchFolder::new("library-tabs-new");

    let database = Database::open(&library_config(&folder)).unwrap();

    assert_eq!(stored(&database).await, []);
}

#[tokio::test]
async fn remembers_the_order_of_the_tabs_and_which_are_hidden_after_the_library_reopens() {
    let folder = ScratchFolder::new("library-tabs-reopen");
    let tabs = vec![
        shown(category("reading")),
        shown(StoredTab::All),
        hidden(category("manga")),
        shown(StoredTab::NewChapters),
    ];
    set(
        &Database::open(&library_config(&folder)).unwrap(),
        tabs.clone(),
    )
    .await;

    let reopened = Database::open(&library_config(&folder)).unwrap();

    assert_eq!(stored(&reopened).await, tabs);
}

#[tokio::test]
async fn keeps_only_the_tabs_set_last() {
    let folder = ScratchFolder::new("library-tabs-again");
    let database = Database::open(&library_config(&folder)).unwrap();
    set(
        &database,
        vec![
            shown(StoredTab::All),
            hidden(StoredTab::NewChapters),
            shown(category("manga")),
        ],
    )
    .await;

    set(
        &database,
        vec![shown(StoredTab::NewChapters), shown(StoredTab::All)],
    )
    .await;

    assert_eq!(
        stored(&database).await,
        [shown(StoredTab::NewChapters), shown(StoredTab::All)]
    );
}
