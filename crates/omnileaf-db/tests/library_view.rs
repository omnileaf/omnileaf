#![expect(
    clippy::unwrap_used,
    reason = "each test builds its own scratch library, so a failed set-up should stop the test"
)]

mod support;

use omnileaf_db::{
    Database, Error,
    library_view::{LibraryDisplay, StoredLibraryView, library_view, set_library_view},
};
use proptest::prelude::*;
use support::ScratchFolder;

const LIST_OF_FOUR: StoredLibraryView = StoredLibraryView {
    display: LibraryDisplay::List,
    phone_covers_per_row: 4,
    tablet_covers_per_row: 7,
    desktop_covers_per_row: 10,
    shows_item_counts: true,
};

const COMPACT_OF_TWO: StoredLibraryView = StoredLibraryView {
    display: LibraryDisplay::Compact,
    phone_covers_per_row: 2,
    tablet_covers_per_row: 3,
    desktop_covers_per_row: 4,
    shows_item_counts: false,
};

async fn stored(database: &Database) -> Option<StoredLibraryView> {
    database.read(library_view).await.unwrap()
}

async fn set(database: &Database, view: StoredLibraryView) -> Result<(), Error> {
    database
        .write(move |transaction| set_library_view(transaction, &view))
        .await
}

#[tokio::test]
async fn a_new_library_has_no_view_stored() {
    let folder = ScratchFolder::new("library-view-new");

    let database = Database::open(&folder.config()).unwrap();

    assert_eq!(stored(&database).await, None);
}

#[tokio::test]
async fn remembers_the_view_after_the_library_reopens() {
    let folder = ScratchFolder::new("library-view-reopen");
    set(&Database::open(&folder.config()).unwrap(), LIST_OF_FOUR)
        .await
        .unwrap();

    let reopened = Database::open(&folder.config()).unwrap();

    assert_eq!(stored(&reopened).await, Some(LIST_OF_FOUR));
}

#[tokio::test]
async fn keeps_only_the_view_set_last() {
    let folder = ScratchFolder::new("library-view-again");
    let database = Database::open(&folder.config()).unwrap();
    set(&database, LIST_OF_FOUR).await.unwrap();

    set(&database, COMPACT_OF_TWO).await.unwrap();

    assert_eq!(stored(&database).await, Some(COMPACT_OF_TWO));
}

#[tokio::test]
async fn refuses_more_covers_per_row_than_a_phone_holds_and_keeps_the_view_before() {
    let folder = ScratchFolder::new("library-view-too-many");
    let database = Database::open(&folder.config()).unwrap();
    set(&database, LIST_OF_FOUR).await.unwrap();

    let outcome = set(
        &database,
        StoredLibraryView {
            phone_covers_per_row: 6,
            ..COMPACT_OF_TWO
        },
    )
    .await;

    assert!(matches!(outcome, Err(Error::Statement(_))));
    assert_eq!(stored(&database).await, Some(LIST_OF_FOUR));
}

fn any_display() -> impl Strategy<Value = LibraryDisplay> {
    prop_oneof![
        Just(LibraryDisplay::Grid),
        Just(LibraryDisplay::Compact),
        Just(LibraryDisplay::List),
    ]
}

fn any_view() -> impl Strategy<Value = StoredLibraryView> {
    (any_display(), 2_u8..=5, 3_u8..=8, 4_u8..=12, any::<bool>()).prop_map(
        |(
            display,
            phone_covers_per_row,
            tablet_covers_per_row,
            desktop_covers_per_row,
            shows_item_counts,
        )| {
            StoredLibraryView {
                display,
                phone_covers_per_row,
                tablet_covers_per_row,
                desktop_covers_per_row,
                shows_item_counts,
            }
        },
    )
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(32))]

    #[test]
    fn reads_back_any_view_within_the_ranges_as_it_was_set(view in any_view()) {
        let folder = ScratchFolder::new("library-view-any");
        let database = Database::open(&folder.config()).unwrap();
        let runtime = tokio::runtime::Builder::new_current_thread().build().unwrap();

        let read = runtime.block_on(async {
            set(&database, view).await.unwrap();
            stored(&database).await
        });

        prop_assert_eq!(read, Some(view));
    }
}
