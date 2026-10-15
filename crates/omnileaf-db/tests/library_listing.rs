#![expect(
    clippy::unwrap_used,
    reason = "each test builds its own scratch library, so a failed set-up should stop the test"
)]

mod support;

use omnileaf_db::{
    Database,
    catalog::{Inclusion, SeriesFilter, SeriesListing, SeriesOrder, SeriesSort, SortDirection},
    library_listing::{library_listing, set_library_listing},
};
use proptest::prelude::*;
use support::{ScratchFolder, library_config};

const UNREAD_NEWEST_FIRST: SeriesListing = SeriesListing {
    sort: SeriesSort::descending(SeriesOrder::DateAdded),
    filter: SeriesFilter {
        unread: Inclusion::Only,
        started: Inclusion::Any,
        finished: Inclusion::Hide,
    },
};

const Z_TO_A: SeriesListing = SeriesListing::unfiltered(SeriesSort::descending(SeriesOrder::Title));

async fn stored(database: &Database) -> Option<SeriesListing> {
    database.read(library_listing).await.unwrap()
}

async fn set(database: &Database, listing: SeriesListing) {
    database
        .write(move |transaction| set_library_listing(transaction, &listing))
        .await
        .unwrap();
}

#[tokio::test]
async fn a_new_library_has_no_listing_stored() {
    let folder = ScratchFolder::new("library-listing-new");

    let database = Database::open(&library_config(&folder)).unwrap();

    assert_eq!(stored(&database).await, None);
}

#[tokio::test]
async fn remembers_the_listing_after_the_library_reopens() {
    let folder = ScratchFolder::new("library-listing-reopen");
    set(
        &Database::open(&library_config(&folder)).unwrap(),
        UNREAD_NEWEST_FIRST,
    )
    .await;

    let reopened = Database::open(&library_config(&folder)).unwrap();

    assert_eq!(stored(&reopened).await, Some(UNREAD_NEWEST_FIRST));
}

#[tokio::test]
async fn keeps_only_the_listing_set_last() {
    let folder = ScratchFolder::new("library-listing-again");
    let database = Database::open(&library_config(&folder)).unwrap();
    set(&database, UNREAD_NEWEST_FIRST).await;

    set(&database, Z_TO_A).await;

    assert_eq!(stored(&database).await, Some(Z_TO_A));
}

fn any_inclusion() -> impl Strategy<Value = Inclusion> {
    prop_oneof![
        Just(Inclusion::Any),
        Just(Inclusion::Only),
        Just(Inclusion::Hide),
    ]
}

fn any_listing() -> impl Strategy<Value = SeriesListing> {
    (
        prop_oneof![
            Just(SeriesOrder::Title),
            Just(SeriesOrder::DateAdded),
            Just(SeriesOrder::LastRead),
        ],
        prop_oneof![
            Just(SortDirection::Ascending),
            Just(SortDirection::Descending)
        ],
        any_inclusion(),
        any_inclusion(),
        any_inclusion(),
    )
        .prop_map(
            |(order, direction, unread, started, finished)| SeriesListing {
                sort: SeriesSort { order, direction },
                filter: SeriesFilter {
                    unread,
                    started,
                    finished,
                },
            },
        )
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(32))]

    #[test]
    fn reads_back_any_listing_as_it_was_set(listing in any_listing()) {
        let folder = ScratchFolder::new("library-listing-any");
        let database = Database::open(&library_config(&folder)).unwrap();
        let runtime = tokio::runtime::Builder::new_current_thread().build().unwrap();

        let read = runtime.block_on(async {
            set(&database, listing).await;
            stored(&database).await
        });

        prop_assert_eq!(read, Some(listing));
    }
}
