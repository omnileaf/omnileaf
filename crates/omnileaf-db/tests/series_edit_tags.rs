#![expect(
    clippy::unwrap_used,
    reason = "each test builds its own scratch library, so a failed set-up should stop the test"
)]

mod library_seed;
#[expect(
    dead_code,
    reason = "these tests take only the store's clock, never its reading helpers"
)]
mod store_support;
mod support;

use library_seed::{SeriesSeed, seed_library};
use omnileaf_db::store::{SeriesEdits, Store};
use omnileaf_sync_proto::SeriesId;
use store_support::{FakeClock, NOW_UNIX_MS, open_store};
use support::ScratchFolder;

const BOOK_TITLES: &[&str] = &["Volume 01", "Volume 02"];

async fn library(name: &str) -> (Store, ScratchFolder) {
    let folder = ScratchFolder::new(name);
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
    let series: Vec<SeriesSeed<'_>> = ["Sample Series 01", "Sample Series 02"]
        .iter()
        .map(|&name| SeriesSeed {
            book_titles: BOOK_TITLES,
            ..SeriesSeed::named(name)
        })
        .collect();
    seed_library(store.database(), &series).await;
    (store, folder)
}

fn series(number: u32) -> SeriesId {
    SeriesId::local(&format!("Sample Series {number:02}")).unwrap()
}

async fn file_tag(store: &Store, title: &str, name: &'static str) {
    let title = title.to_owned();
    store
        .database()
        .write(move |transaction| {
            transaction.execute(
                "INSERT OR IGNORE INTO book_details (book_id) SELECT book.id FROM book
                JOIN series ON series.local_id = book.series_local_id
                WHERE series.title = ?1 AND book.title = 'Volume 01'",
                [&title],
            )?;
            transaction.execute(
                "INSERT INTO book_tag (book_id, kind, name) SELECT book.id, 'tag', ?2 FROM book
                JOIN series ON series.local_id = book.series_local_id
                WHERE series.title = ?1 AND book.title = 'Volume 01'",
                (&title, name),
            )?;
            Ok(())
        })
        .await
        .unwrap();
}

async fn edit_tags(store: &Store, number: u32, tags: Option<&[&str]>) {
    let edits = SeriesEdits {
        tags: tags.map(|tags| tags.iter().map(|&tag| tag.to_owned()).collect()),
        ..SeriesEdits::default()
    };
    let id = series(number);
    store
        .write(move |writer| writer.edit_series(id, edits))
        .await
        .unwrap();
}

async fn tags_of(store: &Store, title: &str) -> Vec<(String, i64)> {
    let title = title.to_owned();
    store
        .database()
        .read(move |connection| {
            Ok(connection
                .prepare(
                    "SELECT series_tag.name, series_tag.book_count FROM series_tag
                    JOIN series ON series.local_id = series_tag.series_local_id
                    WHERE series.title = ?1 ORDER BY series_tag.name",
                )?
                .query_map([title], |row| Ok((row.get(0)?, row.get(1)?)))?
                .collect::<Result<_, _>>()?)
        })
        .await
        .unwrap()
}

async fn searchable_tags(store: &Store) -> Vec<String> {
    store
        .database()
        .read(|connection| {
            Ok(connection
                .prepare("SELECT name FROM search_name WHERE kind = 'tag' ORDER BY name")?
                .query_map([], |row| row.get(0))?
                .collect::<Result<_, _>>()?)
        })
        .await
        .unwrap()
}

fn counted(tags: &[(&str, i64)]) -> Vec<(String, i64)> {
    tags.iter()
        .map(|&(name, count)| (name.to_owned(), count))
        .collect()
}

#[tokio::test]
async fn shows_the_edited_tags_in_place_of_the_files_and_the_files_again_after_a_clear() {
    let (store, _folder) = library("edit-tags").await;
    file_tag(&store, "Sample Series 01", "storms").await;

    edit_tags(&store, 1, Some(&["lanterns", "harbour"])).await;
    let edited = tags_of(&store, "Sample Series 01").await;
    let searchable = searchable_tags(&store).await;
    edit_tags(&store, 1, None).await;

    assert_eq!(edited, counted(&[("harbour", 1), ("lanterns", 1)]));
    assert_eq!(searchable, ["harbour", "lanterns"]);
    assert_eq!(
        tags_of(&store, "Sample Series 01").await,
        counted(&[("storms", 1)])
    );
    assert_eq!(searchable_tags(&store).await, ["storms"]);
}

#[tokio::test]
async fn leaves_a_series_with_no_tags_when_its_tags_are_edited_to_none() {
    let (store, _folder) = library("edit-tags-none").await;
    file_tag(&store, "Sample Series 01", "storms").await;

    edit_tags(&store, 1, Some(&[])).await;

    assert_eq!(tags_of(&store, "Sample Series 01").await, []);
}

#[tokio::test]
async fn follows_the_files_again_from_what_they_held_while_the_tags_were_edited() {
    let (store, _folder) = library("edit-tags-files-change").await;
    file_tag(&store, "Sample Series 01", "storms").await;
    edit_tags(&store, 1, Some(&["lanterns"])).await;

    file_tag(&store, "Sample Series 01", "harbour").await;
    store
        .database()
        .write(|transaction| {
            transaction.execute("DELETE FROM book_tag WHERE name = 'storms'", [])?;
            Ok(())
        })
        .await
        .unwrap();
    let while_edited = tags_of(&store, "Sample Series 01").await;
    edit_tags(&store, 1, None).await;

    assert_eq!(while_edited, counted(&[("lanterns", 1)]));
    assert_eq!(
        tags_of(&store, "Sample Series 01").await,
        counted(&[("harbour", 1)])
    );
}

#[tokio::test]
async fn keeps_the_tags_of_the_other_series() {
    let (store, _folder) = library("edit-tags-others").await;
    file_tag(&store, "Sample Series 02", "storms").await;

    edit_tags(&store, 1, Some(&["lanterns"])).await;

    assert_eq!(
        tags_of(&store, "Sample Series 02").await,
        counted(&[("storms", 1)])
    );
}

#[tokio::test]
async fn takes_the_edited_tags_back_when_the_projections_are_rebuilt_without_the_registers() {
    let (store, _folder) = library("edit-tags-rebuild").await;
    file_tag(&store, "Sample Series 01", "storms").await;
    edit_tags(&store, 1, Some(&["lanterns"])).await;
    store.rebuild_projections().await.unwrap();
    let rebuilt = tags_of(&store, "Sample Series 01").await;
    store
        .database()
        .write(|transaction| Ok(transaction.execute("DELETE FROM sync_register", [])?))
        .await
        .unwrap();
    store.rebuild_projections().await.unwrap();

    assert_eq!(rebuilt, counted(&[("lanterns", 1)]));
    assert_eq!(
        tags_of(&store, "Sample Series 01").await,
        counted(&[("storms", 1)])
    );
}

#[tokio::test]
async fn shows_the_edited_tags_of_a_series_scanned_after_the_edit() {
    let folder = ScratchFolder::new("edit-tags-before-scan");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
    edit_tags(&store, 1, Some(&["lanterns"])).await;

    seed_library(
        store.database(),
        &[SeriesSeed {
            book_titles: BOOK_TITLES,
            ..SeriesSeed::named("Sample Series 01")
        }],
    )
    .await;

    assert_eq!(
        tags_of(&store, "Sample Series 01").await,
        counted(&[("lanterns", 1)])
    );
}
