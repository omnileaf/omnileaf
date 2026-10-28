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
    catalog::PersonRole,
    store::{EditedPerson, SeriesEdits, Store, series_edits},
};
use omnileaf_sync_proto::{ProfileId, SeriesId, Value};
use proptest::{collection::vec, prelude::*, sample::select};
use store_support::{FakeClock, NOW_UNIX_MS, open_store};
use support::ScratchFolder;

const ANOTHER_PROFILE: &str = "0b5e1a3c-7d2f-8a4b-9c6d-1e2f3a4b5c6d";

fn series(number: u32) -> SeriesId {
    SeriesId::local(&format!("Sample Series {number}")).unwrap()
}

fn person(name: &str, roles: &[PersonRole]) -> EditedPerson {
    EditedPerson {
        name: name.to_owned(),
        roles: roles.to_vec(),
    }
}

fn full_edits() -> SeriesEdits {
    SeriesEdits {
        title: Some("Edited Title".to_owned()),
        summary: Some("Line one\nLine two".to_owned()),
        people: Some(vec![
            person(
                "Sample Writer",
                &[PersonRole::Writer, PersonRole::Penciller],
            ),
            person("Sample Helper", &[]),
        ]),
        tags: Some(vec!["Sample Tag".to_owned(), "Other Tag".to_owned()]),
        is_adult: true,
    }
}

async fn edit(store: &Store, series: SeriesId, edits: SeriesEdits) {
    store
        .write(move |writer| writer.edit_series(series, edits))
        .await
        .unwrap();
}

async fn kept(store: &Store, series: SeriesId) -> SeriesEdits {
    store
        .database()
        .read(move |connection| series_edits(connection, series))
        .await
        .unwrap()
}

async fn register_count(store: &Store) -> u32 {
    store
        .database()
        .read(|connection| {
            Ok(connection.query_row("SELECT count(*) FROM sync_register", [], |row| row.get(0))?)
        })
        .await
        .unwrap()
}

#[tokio::test]
async fn keeps_every_edited_field_of_a_series() {
    let folder = ScratchFolder::new("series-edits-kept");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));

    edit(&store, series(1), full_edits()).await;

    assert_eq!(kept(&store, series(1)).await, full_edits());
    assert_eq!(kept(&store, series(2)).await, SeriesEdits::default());
}

#[tokio::test]
async fn clears_an_edit_back_to_the_files_with_an_absent_field() {
    let folder = ScratchFolder::new("series-edits-cleared");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
    edit(&store, series(1), full_edits()).await;

    edit(
        &store,
        series(1),
        SeriesEdits {
            summary: Some("Line one\nLine two".to_owned()),
            ..SeriesEdits::default()
        },
    )
    .await;

    assert_eq!(
        kept(&store, series(1)).await,
        SeriesEdits {
            summary: Some("Line one\nLine two".to_owned()),
            ..SeriesEdits::default()
        }
    );
}

#[tokio::test]
async fn keeps_an_emptied_list_apart_from_a_cleared_one() {
    let folder = ScratchFolder::new("series-edits-emptied");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));

    edit(
        &store,
        series(1),
        SeriesEdits {
            people: Some(vec![]),
            tags: Some(vec![]),
            ..SeriesEdits::default()
        },
    )
    .await;

    let edits = kept(&store, series(1)).await;
    assert_eq!((edits.people, edits.tags), (Some(vec![]), Some(vec![])));
}

#[tokio::test]
async fn writes_only_the_fields_that_changed() {
    let folder = ScratchFolder::new("series-edits-changed-only");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
    edit(&store, series(1), full_edits()).await;
    let after_first = register_count(&store).await;

    edit(&store, series(1), full_edits()).await;
    let after_same = register_count(&store).await;
    edit(
        &store,
        series(1),
        SeriesEdits {
            title: Some("Another Title".to_owned()),
            ..full_edits()
        },
    )
    .await;

    assert_eq!(
        (after_first, after_same, register_count(&store).await),
        (5, 5, 5)
    );
}

#[tokio::test]
async fn writes_a_name_with_a_line_break_with_a_space() {
    let folder = ScratchFolder::new("series-edits-line-break");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));

    edit(
        &store,
        series(1),
        SeriesEdits {
            tags: Some(vec!["Two\nLines".to_owned(), "  ".to_owned()]),
            people: Some(vec![person("A\tB", &[PersonRole::Writer])]),
            ..SeriesEdits::default()
        },
    )
    .await;

    let edits = kept(&store, series(1)).await;
    assert_eq!(edits.tags, Some(vec!["Two Lines".to_owned()]));
    assert_eq!(
        edits.people,
        Some(vec![person("A B", &[PersonRole::Writer])])
    );
}

#[tokio::test]
async fn shows_every_profile_the_household_s_edits() {
    let folder = ScratchFolder::new("series-edits-household");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
    store
        .switch_profile(ANOTHER_PROFILE.parse().unwrap())
        .await
        .unwrap();
    edit(&store, series(1), full_edits()).await;

    store
        .switch_profile(ProfileId::default_profile())
        .await
        .unwrap();

    assert_eq!(kept(&store, series(1)).await, full_edits());
}

#[tokio::test]
async fn projects_the_same_edits_again_from_the_registers() {
    let folder = ScratchFolder::new("series-edits-rebuilt");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
    edit(&store, series(1), full_edits()).await;
    store
        .database()
        .write(|transaction| {
            for table in ["series_edit", "series_edit_person", "series_edit_tag"] {
                transaction.execute(&format!("DELETE FROM {table}"), [])?;
            }
            Ok(())
        })
        .await
        .unwrap();

    store.rebuild_projections().await.unwrap();

    assert_eq!(kept(&store, series(1)).await, full_edits());
}

#[tokio::test]
async fn takes_a_blank_title_written_by_another_device_as_cleared() {
    let folder = ScratchFolder::new("series-edits-blank-title");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
    edit(&store, series(1), full_edits()).await;
    let blank = omnileaf_sync_proto::Value::Text("  ".to_owned()).to_cbor();
    store
        .database()
        .write(move |transaction| {
            transaction.execute(
                "UPDATE sync_register SET value = ?1, hlc = hlc + 1000
                WHERE entity = 'series' AND field = 'meta.title'",
                [blank],
            )?;
            Ok(())
        })
        .await
        .unwrap();

    store.rebuild_projections().await.unwrap();

    assert_eq!(
        kept(&store, series(1)).await,
        SeriesEdits {
            title: None,
            ..full_edits()
        }
    );
}

fn any_edits() -> impl Strategy<Value = SeriesEdits> {
    let roles = vec(
        select(vec![
            PersonRole::Writer,
            PersonRole::Penciller,
            PersonRole::Editor,
        ]),
        0..3,
    );
    let people = vec(
        (select(vec!["Ann", "Bo", "Cy"]), roles).prop_map(|(name, roles)| EditedPerson {
            name: name.to_owned(),
            roles,
        }),
        0..4,
    );
    (
        proptest::option::of(select(vec!["One", "Two"])),
        proptest::option::of(select(vec!["Note", "Other\nNote"])),
        proptest::option::of(people),
        proptest::option::of(vec(select(vec!["x", "y", "z"]), 0..3)),
        any::<bool>(),
    )
        .prop_map(|(title, summary, people, tags, is_adult)| SeriesEdits {
            title: title.map(str::to_owned),
            summary: summary.map(str::to_owned),
            people,
            tags: tags.map(|tags| tags.into_iter().map(str::to_owned).collect()),
            is_adult,
        })
}

type Shown = (
    Vec<(String, i64)>,
    Vec<(String, String)>,
    Vec<(String, String, String)>,
);

async fn seed_files(store: &Store) {
    let series: Vec<SeriesSeed<'_>> = ["Sample Series 1", "Sample Series 2"]
        .iter()
        .map(|&name| SeriesSeed {
            book_titles: &["Volume 01"],
            ..SeriesSeed::named(name)
        })
        .collect();
    seed_library(store.database(), &series).await;
    store
        .database()
        .write(|transaction| {
            transaction.execute("INSERT INTO book_details (book_id) SELECT id FROM book", [])?;
            transaction.execute(
                "INSERT INTO book_tag (book_id, kind, name) SELECT id, 'tag', 'x' FROM book",
                [],
            )?;
            transaction.execute(
                "INSERT INTO book_person (book_id, role, name, name_key)
                SELECT id, 'writer', 'Ann', CAST('Ann' AS BLOB) FROM book",
                [],
            )?;
            Ok(())
        })
        .await
        .unwrap();
}

async fn shown(store: &Store) -> Shown {
    store
        .database()
        .read(|connection| {
            let series = connection
                .prepare("SELECT title, adult_rated_books FROM series ORDER BY id")?
                .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
                .collect::<Result<_, _>>()?;
            let tags = connection
                .prepare(
                    "SELECT series.title, series_tag.name FROM series_tag
                    JOIN series ON series.local_id = series_tag.series_local_id
                    ORDER BY 1, 2",
                )?
                .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
                .collect::<Result<_, _>>()?;
            let people = connection
                .prepare(
                    "SELECT series.title, series_person.role, series_person.name
                    FROM series_person
                    JOIN series ON series.local_id = series_person.series_local_id
                    ORDER BY 1, 2, 3",
                )?
                .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?
                .collect::<Result<_, _>>()?;
            Ok((series, tags, people))
        })
        .await
        .unwrap()
}

async fn inject_unreadable_registers(store: &Store) {
    let id = series(3);
    let unreadable = [
        ("meta.title", Value::Bool(true)),
        ("meta.adult", Value::Text("yes".to_owned())),
        ("meta.people", Value::Unsigned(1)),
        ("meta.tags", Value::Bool(false)),
        ("meta.summary", Value::Unsigned(2)),
    ];
    store
        .database()
        .write(move |transaction| {
            for (field, value) in unreadable {
                transaction.execute(
                    "INSERT INTO sync_register
                    (profile, entity, id, field, class, hlc, node, seq, rank, value)
                    VALUES (?1, 'series', ?2, ?3, 'lww', 1, zeroblob(16), 1, NULL, ?4)",
                    (
                        ProfileId::shared().as_bytes(),
                        id.as_bytes(),
                        field,
                        value.to_cbor(),
                    ),
                )?;
            }
            Ok(())
        })
        .await
        .unwrap();
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(24))]

    #[test]
    fn projects_by_rebuilding_what_it_projected_one_write_at_a_time(
        writes in vec((1..3_u32, any_edits()), 1..6)
    ) {
        let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();
        runtime.block_on(async {
            let folder = ScratchFolder::new("series-edits-rebuild-equals-incremental");
            let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
            seed_files(&store).await;
            for (number, edits) in writes {
                edit(&store, series(number), edits).await;
            }
            let incremental = (
                [kept(&store, series(1)).await, kept(&store, series(2)).await],
                shown(&store).await,
            );

            inject_unreadable_registers(&store).await;
            store.rebuild_projections().await.unwrap();

            let rebuilt = (
                [kept(&store, series(1)).await, kept(&store, series(2)).await],
                shown(&store).await,
            );
            prop_assert_eq!(incremental, rebuilt);
            prop_assert_eq!(kept(&store, series(3)).await, SeriesEdits::default());
            Ok(())
        })?;
    }
}
