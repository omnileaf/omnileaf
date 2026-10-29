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
use omnileaf_db::{
    adult_content::AdultHiding,
    catalog::{
        PageRequest, PageSize, PersonRole, SeriesFilter, WriterSummary, person_series,
        series_people, writerless_series_count, writers,
    },
    store::{EditedPerson, SeriesEdits, Store},
};
use omnileaf_sync_proto::SeriesId;
use store_support::{FakeClock, NOW_UNIX_MS, open_store};
use support::ScratchFolder;

const BOOK_TITLES: &[&str] = &["Volume 01", "Volume 02"];

async fn library(name: &str) -> (Store, ScratchFolder) {
    let folder = ScratchFolder::new(name);
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
    seed_all(&store).await;
    (store, folder)
}

async fn seed_all(store: &Store) {
    let series: Vec<SeriesSeed<'_>> = ["Sample Series 01", "Sample Series 02"]
        .iter()
        .map(|&name| SeriesSeed {
            book_titles: BOOK_TITLES,
            ..SeriesSeed::named(name)
        })
        .collect();
    seed_library(store.database(), &series).await;
}

fn series(number: u32) -> SeriesId {
    SeriesId::local(&format!("Sample Series {number:02}")).unwrap()
}

async fn file_person(store: &Store, title: &str, role: &'static str, name: &'static str) {
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
                "INSERT INTO book_person (book_id, role, name, name_key)
                SELECT book.id, ?2, ?3, CAST(?3 AS BLOB) FROM book
                JOIN series ON series.local_id = book.series_local_id
                WHERE series.title = ?1 AND book.title = 'Volume 01'",
                (&title, role, name),
            )?;
            Ok(())
        })
        .await
        .unwrap();
}

fn person(name: &str, roles: &[PersonRole]) -> EditedPerson {
    EditedPerson {
        name: name.to_owned(),
        roles: roles.to_vec(),
    }
}

async fn edit_people(store: &Store, number: u32, people: Option<Vec<EditedPerson>>) {
    let id = series(number);
    store
        .write(move |writer| {
            writer.edit_series(
                id,
                SeriesEdits {
                    people,
                    ..SeriesEdits::default()
                },
            )
        })
        .await
        .unwrap();
}

async fn shown(store: &Store, number: u32) -> Vec<(String, Vec<PersonRole>)> {
    let id = series(number);
    store
        .database()
        .read(move |connection| series_people(connection, id))
        .await
        .unwrap()
        .into_iter()
        .map(|person| (person.name, person.roles))
        .collect()
}

async fn listed_writers(store: &Store) -> Vec<WriterSummary> {
    store
        .database()
        .read(|connection| {
            writers(
                connection,
                &PageRequest {
                    after: None,
                    size: PageSize::try_from(50).unwrap(),
                },
                AdultHiding::default(),
            )
        })
        .await
        .unwrap()
        .items
}

async fn series_of(store: &Store, name: &'static str) -> Vec<String> {
    store
        .database()
        .read(move |connection| person_series(connection, name, AdultHiding::default()))
        .await
        .unwrap()
        .into_iter()
        .map(|series| series.title)
        .collect()
}

fn writer(name: &str, series_count: u32) -> WriterSummary {
    WriterSummary {
        name: name.to_owned(),
        series_count,
    }
}

fn shown_person(name: &str, roles: &[PersonRole]) -> (String, Vec<PersonRole>) {
    (name.to_owned(), roles.to_vec())
}

#[tokio::test]
async fn shows_the_edited_people_in_place_of_the_files_and_the_files_again_after_a_clear() {
    let (store, _folder) = library("edit-people").await;
    file_person(&store, "Sample Series 01", "writer", "File Writer").await;

    edit_people(
        &store,
        1,
        Some(vec![
            person(
                "Edited Writer",
                &[PersonRole::Writer, PersonRole::Penciller],
            ),
            person("No Role", &[]),
        ]),
    )
    .await;
    let edited = shown(&store, 1).await;
    edit_people(&store, 1, None).await;

    assert_eq!(
        edited,
        [
            shown_person(
                "Edited Writer",
                &[PersonRole::Penciller, PersonRole::Writer]
            ),
            shown_person("No Role", &[]),
        ]
    );
    assert_eq!(
        shown(&store, 1).await,
        [shown_person("File Writer", &[PersonRole::Writer])]
    );
}

#[tokio::test]
async fn groups_the_series_by_the_edited_writer_and_no_longer_by_the_files() {
    let (store, _folder) = library("edit-people-writers").await;
    file_person(&store, "Sample Series 01", "writer", "File Writer").await;
    file_person(&store, "Sample Series 02", "writer", "File Writer").await;

    edit_people(
        &store,
        1,
        Some(vec![person("Edited Writer", &[PersonRole::Writer])]),
    )
    .await;

    assert_eq!(
        listed_writers(&store).await,
        [writer("Edited Writer", 1), writer("File Writer", 1)]
    );
    assert_eq!(
        series_of(&store, "Edited Writer").await,
        ["Sample Series 01"]
    );
    assert_eq!(series_of(&store, "File Writer").await, ["Sample Series 02"]);
}

async fn writerless_count(store: &Store) -> u32 {
    store
        .database()
        .read(|connection| writerless_series_count(connection, &SeriesFilter::NONE))
        .await
        .unwrap()
}

#[tokio::test]
async fn counts_a_series_as_naming_a_writer_by_its_edited_people() {
    let (store, _folder) = library("edit-people-writerless").await;
    file_person(&store, "Sample Series 01", "writer", "File Writer").await;

    edit_people(
        &store,
        2,
        Some(vec![person("Edited Writer", &[PersonRole::Writer])]),
    )
    .await;
    let once_named = writerless_count(&store).await;
    edit_people(
        &store,
        1,
        Some(vec![person("Edited Penciller", &[PersonRole::Penciller])]),
    )
    .await;

    assert_eq!([once_named, writerless_count(&store).await], [0, 1]);
}

#[tokio::test]
async fn follows_the_files_again_from_what_they_held_while_the_people_were_edited() {
    let (store, _folder) = library("edit-people-files-change").await;
    file_person(&store, "Sample Series 01", "writer", "File Writer").await;
    edit_people(
        &store,
        1,
        Some(vec![person("Edited Writer", &[PersonRole::Writer])]),
    )
    .await;

    file_person(&store, "Sample Series 01", "inker", "Late Inker").await;
    store
        .database()
        .write(|transaction| {
            transaction.execute("DELETE FROM book_person WHERE name = 'File Writer'", [])?;
            Ok(())
        })
        .await
        .unwrap();
    let while_edited = shown(&store, 1).await;
    edit_people(&store, 1, None).await;

    assert_eq!(
        while_edited,
        [shown_person("Edited Writer", &[PersonRole::Writer])]
    );
    assert_eq!(
        shown(&store, 1).await,
        [shown_person("Late Inker", &[PersonRole::Inker])]
    );
}

#[tokio::test]
async fn lists_the_series_of_an_edited_person_who_has_no_role() {
    let (store, _folder) = library("edit-people-no-role").await;

    edit_people(&store, 1, Some(vec![person("No Role", &[])])).await;

    assert_eq!(series_of(&store, "No Role").await, ["Sample Series 01"]);
}

async fn keys(store: &Store) -> [Vec<u8>; 4] {
    store
        .database()
        .read(|connection| {
            let key = |sql: &str| connection.query_row(sql, [], |row| row.get::<_, Vec<u8>>(0));
            Ok([
                key("SELECT title_key FROM series_edit")?,
                key("SELECT title_key FROM series WHERE title = 'Åke Lantern'")?,
                key("SELECT name_key FROM series_edit_person")?,
                key("SELECT name_key FROM series_person WHERE name = 'Åke'")?,
            ])
        })
        .await
        .unwrap()
}

#[tokio::test]
async fn keys_the_edited_title_and_people_again_when_the_title_language_changes() {
    let (store, _folder) = library("edit-people-rekey").await;
    store
        .write(|writer| {
            writer.edit_series(
                series(1),
                SeriesEdits {
                    title: Some("Åke Lantern".to_owned()),
                    people: Some(vec![person("Åke", &[PersonRole::Writer])]),
                    ..SeriesEdits::default()
                },
            )
        })
        .await
        .unwrap();
    let before = keys(&store).await;

    store.sort_titles_for("sv".parse().unwrap()).await.unwrap();
    let after = keys(&store).await;

    assert_eq!(before[0], before[1]);
    assert_eq!(before[2], before[3]);
    assert_eq!(after[0], after[1]);
    assert_eq!(after[2], after[3]);
    assert_ne!(before[0], after[0]);
    assert_ne!(before[2], after[2]);
}

#[tokio::test]
async fn searches_the_edited_names_and_not_the_files_names_they_replaced() {
    let (store, _folder) = library("edit-people-search").await;
    file_person(&store, "Sample Series 01", "writer", "File Writer").await;

    edit_people(&store, 1, Some(vec![person("Edited Writer", &[])])).await;

    let searchable: Vec<String> = store
        .database()
        .read(|connection| {
            Ok(connection
                .prepare("SELECT name FROM search_name WHERE kind = 'person' ORDER BY name")?
                .query_map([], |row| row.get(0))?
                .collect::<Result<_, _>>()?)
        })
        .await
        .unwrap();
    assert_eq!(searchable, ["Edited Writer"]);
}

#[tokio::test]
async fn takes_the_edited_people_back_when_the_projections_are_rebuilt_without_the_registers() {
    let (store, _folder) = library("edit-people-rebuild").await;
    file_person(&store, "Sample Series 01", "writer", "File Writer").await;
    edit_people(
        &store,
        1,
        Some(vec![person("Edited Writer", &[PersonRole::Writer])]),
    )
    .await;
    store.rebuild_projections().await.unwrap();
    let rebuilt = shown(&store, 1).await;
    store
        .database()
        .write(|transaction| Ok(transaction.execute("DELETE FROM sync_register", [])?))
        .await
        .unwrap();
    store.rebuild_projections().await.unwrap();

    assert_eq!(
        rebuilt,
        [shown_person("Edited Writer", &[PersonRole::Writer])]
    );
    assert_eq!(
        shown(&store, 1).await,
        [shown_person("File Writer", &[PersonRole::Writer])]
    );
}

#[tokio::test]
async fn shows_the_edited_people_of_a_series_scanned_after_the_edit() {
    let folder = ScratchFolder::new("edit-people-before-scan");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
    edit_people(
        &store,
        1,
        Some(vec![person("Edited Writer", &[PersonRole::Writer])]),
    )
    .await;

    seed_all(&store).await;

    assert_eq!(
        shown(&store, 1).await,
        [shown_person("Edited Writer", &[PersonRole::Writer])]
    );
}
