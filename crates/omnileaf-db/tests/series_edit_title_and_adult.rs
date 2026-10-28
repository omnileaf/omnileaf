#![expect(
    clippy::unwrap_used,
    reason = "each test builds its own scratch library, so a failed set-up should stop the test"
)]

#[expect(
    dead_code,
    reason = "these tests take only the store's clock, never its reading helpers"
)]
mod store_support;
mod support;

use std::path::{Path, PathBuf};

use omnileaf_db::{
    catalog::{
        AgeRating, BookDetails, BookFile, NewRoot, NewSeries, RootId, RootKind, RootLocator,
        ScannedBook, SeriesFolder, SeriesNaming, Sourced, ValueSource, add_root,
        record_scanned_books, series_overview,
    },
    store::{SeriesEdits, Store},
};
use omnileaf_sync_proto::{Fingerprint, ImageEntry, SeriesId};
use store_support::{FakeClock, NOW_UNIX_MS, open_store};
use support::ScratchFolder;

const ADDED_AT_MS: i64 = 1_790_000_000_000;
const SERIES: &str = "Sample Series 01";

async fn library(name: &str) -> (Store, ScratchFolder, RootId) {
    let folder = ScratchFolder::new(name);
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
    let root = NewRoot {
        kind: RootKind::Linked,
        locator: RootLocator::Path(PathBuf::from("/media/Sample Library")),
        added_at_ms: ADDED_AT_MS,
    };
    let root = store
        .database()
        .write(move |transaction| add_root(transaction, &root))
        .await
        .unwrap();
    (store, folder, root)
}

fn book(root: RootId, series: NewSeries, volume: u32, details: BookDetails) -> ScannedBook {
    ScannedBook {
        series,
        named_series: None,
        fingerprint: Fingerprint::pmf1([ImageEntry {
            crc32: volume,
            size: 1,
        }])
        .unwrap(),
        title: format!("Volume {volume:02}"),
        added_at_ms: ADDED_AT_MS,
        page_count: 1,
        details,
        file: BookFile {
            root,
            location: PathBuf::from(format!("{SERIES}/Volume {volume:02}.cbz")),
            size_bytes: 1,
            modified_at_ms: ADDED_AT_MS,
        },
        numbering: None,
        name_language: None,
    }
}

fn folder_series(title: &str, source: ValueSource) -> NewSeries {
    NewSeries::folder(
        SeriesFolder {
            linked_folder: "Sample Library",
            location: Path::new(SERIES),
        },
        SeriesNaming {
            title: Sourced {
                value: title.to_owned(),
                source,
            },
            year: None,
        },
        ADDED_AT_MS,
    )
    .unwrap()
}

async fn record(store: &Store, books: Vec<ScannedBook>) {
    store
        .database()
        .write(move |transaction| record_scanned_books(transaction, &books))
        .await
        .unwrap();
}

async fn edit(store: &Store, series: SeriesId, edits: SeriesEdits) {
    store
        .write(move |writer| writer.edit_series(series, edits))
        .await
        .unwrap();
}

async fn titles(store: &Store) -> (String, String) {
    store
        .database()
        .read(|connection| {
            Ok(
                connection.query_row("SELECT title, file_title FROM series", [], |row| {
                    Ok((row.get(0)?, row.get(1)?))
                })?,
            )
        })
        .await
        .unwrap()
}

async fn found_by_title(store: &Store, text: &str) -> u32 {
    let text = text.to_owned();
    store
        .database()
        .read(move |connection| {
            Ok(connection.query_row(
                "SELECT count(*) FROM series_fts WHERE series_fts MATCH ?1",
                [format!("\"{text}\"")],
                |row| row.get(0),
            )?)
        })
        .await
        .unwrap()
}

async fn adult_count(store: &Store) -> i64 {
    store
        .database()
        .read(|connection| {
            Ok(connection
                .query_row("SELECT adult_rated_books FROM series", [], |row| row.get(0))?)
        })
        .await
        .unwrap()
}

fn titled(title: &str) -> SeriesEdits {
    SeriesEdits {
        title: Some(title.to_owned()),
        ..SeriesEdits::default()
    }
}

fn marked() -> SeriesEdits {
    SeriesEdits {
        is_adult: true,
        ..SeriesEdits::default()
    }
}

fn series_id() -> SeriesId {
    folder_series(SERIES, ValueSource::FolderName).id()
}

#[tokio::test]
async fn shows_an_edited_title_in_the_series_and_its_search_and_the_file_s_title_after_a_clear() {
    let (store, _folder, root) = library("edit-title").await;
    let series = folder_series(SERIES, ValueSource::FolderName);
    record(&store, vec![book(root, series, 1, BookDetails::default())]).await;

    edit(&store, series_id(), titled("Renamed Lantern")).await;
    let edited = (
        titles(&store).await,
        found_by_title(&store, "Lantern").await,
    );
    edit(&store, series_id(), SeriesEdits::default()).await;
    let cleared = (
        titles(&store).await,
        found_by_title(&store, "Lantern").await,
    );

    assert_eq!(
        edited,
        ((String::from("Renamed Lantern"), SERIES.to_owned()), 1)
    );
    assert_eq!(cleared, ((SERIES.to_owned(), SERIES.to_owned()), 0));
}

#[tokio::test]
async fn sorts_a_series_by_its_edited_title() {
    let (store, _folder, root) = library("edit-title-key").await;
    record(
        &store,
        vec![book(
            root,
            folder_series(SERIES, ValueSource::FolderName),
            1,
            BookDetails::default(),
        )]
        .into_iter()
        .chain([book(
            root,
            NewSeries::local("Sample Series 02", ADDED_AT_MS).unwrap(),
            2,
            BookDetails::default(),
        )])
        .collect(),
    )
    .await;

    edit(&store, series_id(), titled("Zebra")).await;

    let first: String = store
        .database()
        .read(|connection| {
            Ok(connection.query_row(
                "SELECT title FROM series ORDER BY title_key LIMIT 1",
                [],
                |row| row.get(0),
            )?)
        })
        .await
        .unwrap();
    assert_eq!(first, "Sample Series 02");
}

#[tokio::test]
async fn keeps_an_edited_title_over_a_series_added_after_the_edit_and_over_a_better_file_title() {
    let (store, _folder, root) = library("edit-title-before-scan").await;
    edit(&store, series_id(), titled("Renamed Lantern")).await;

    record(
        &store,
        vec![book(
            root,
            folder_series(SERIES, ValueSource::FolderName),
            1,
            BookDetails::default(),
        )],
    )
    .await;
    let added = titles(&store).await;
    record(
        &store,
        vec![book(
            root,
            folder_series("Files Title", ValueSource::Files),
            1,
            BookDetails::default(),
        )],
    )
    .await;
    let rescanned = titles(&store).await;
    edit(&store, series_id(), SeriesEdits::default()).await;

    assert_eq!(added, ("Renamed Lantern".to_owned(), SERIES.to_owned()));
    assert_eq!(
        rescanned,
        ("Renamed Lantern".to_owned(), "Files Title".to_owned())
    );
    assert_eq!(titles(&store).await.0, "Files Title");
}

#[tokio::test]
async fn counts_a_series_marked_by_hand_as_rated_18_and_tells_it_from_a_rating_of_the_files() {
    let (store, _folder, root) = library("edit-adult").await;
    let rated = BookDetails {
        age_rating: Some(AgeRating::AdultsOnly18),
        ..BookDetails::default()
    };
    record(
        &store,
        vec![book(
            root,
            folder_series(SERIES, ValueSource::FolderName),
            1,
            BookDetails::default(),
        )],
    )
    .await;

    edit(&store, series_id(), marked()).await;
    let marked_only = overview_flags(&store).await;
    record(
        &store,
        vec![book(
            root,
            folder_series(SERIES, ValueSource::FolderName),
            1,
            rated,
        )],
    )
    .await;
    let counted_with_files = adult_count(&store).await;
    edit(&store, series_id(), SeriesEdits::default()).await;

    assert_eq!(marked_only, (true, false));
    assert_eq!(counted_with_files, 2);
    assert_eq!(adult_count(&store).await, 1);
}

async fn overview_flags(store: &Store) -> (bool, bool) {
    let overview = store
        .database()
        .read(|connection| series_overview(connection, series_id()))
        .await
        .unwrap()
        .unwrap();
    (overview.is_marked_adult, overview.is_rated_adult)
}

#[tokio::test]
async fn marks_a_series_added_after_the_mark_and_drops_the_mark_once_its_registers_are_gone() {
    let (store, _folder, root) = library("edit-adult-before-scan").await;
    edit(&store, series_id(), marked()).await;
    record(
        &store,
        vec![book(
            root,
            folder_series(SERIES, ValueSource::FolderName),
            1,
            BookDetails::default(),
        )],
    )
    .await;
    let added = adult_count(&store).await;

    store
        .database()
        .write(|transaction| Ok(transaction.execute("DELETE FROM sync_register", [])?))
        .await
        .unwrap();
    store.rebuild_projections().await.unwrap();

    assert_eq!((added, adult_count(&store).await), (1, 0));
}

#[tokio::test]
async fn shows_the_titles_again_when_the_projections_are_rebuilt() {
    let (store, _folder, root) = library("edit-title-rebuild").await;
    record(
        &store,
        vec![book(
            root,
            folder_series(SERIES, ValueSource::FolderName),
            1,
            BookDetails::default(),
        )],
    )
    .await;
    edit(&store, series_id(), titled("Renamed Lantern")).await;
    store.rebuild_projections().await.unwrap();
    let kept = titles(&store).await.0;
    store
        .database()
        .write(|transaction| Ok(transaction.execute("DELETE FROM sync_register", [])?))
        .await
        .unwrap();
    store.rebuild_projections().await.unwrap();

    assert_eq!(kept, "Renamed Lantern");
    assert_eq!(titles(&store).await.0, SERIES);
}
