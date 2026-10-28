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

use omnileaf_db::store::{Changed, Key, LabelKey, Store};
use omnileaf_sync_proto::{CategoryId, ProfileId, SeriesId, TagId, Value};
use proptest::{collection::vec, prelude::*, sample::select};
use store_support::{FakeClock, NOW_UNIX_MS, open_store};
use support::ScratchFolder;

const ANOTHER_PROFILE: &str = "0b5e1a3c-7d2f-8a4b-9c6d-1e2f3a4b5c6d";
const NAMES: [&str; 3] = ["Sample Shelf", "Sample Tag", "Other Name"];

#[derive(Debug, PartialEq, Eq)]
struct Labels {
    categories: Vec<(CategoryId, String, i64)>,
    tags: Vec<(TagId, String)>,
    tag_norms: Vec<(TagId, String)>,
    in_category: Vec<(SeriesId, CategoryId)>,
    with_tag: Vec<(SeriesId, TagId)>,
}

fn another_profile() -> ProfileId {
    ANOTHER_PROFILE.parse().unwrap()
}

fn series(number: u32) -> SeriesId {
    SeriesId::local(&format!("Sample Series {number}")).unwrap()
}

fn category(name: &str) -> CategoryId {
    CategoryId::from_name(name).unwrap()
}

fn tag(name: &str) -> TagId {
    TagId::from_name(name).unwrap()
}

async fn create_category(store: &Store, name: &'static str) -> CategoryId {
    store
        .write(move |writer| writer.create_category(name))
        .await
        .unwrap()
}

async fn create_tag(store: &Store, name: &'static str) -> TagId {
    store
        .write(move |writer| writer.create_tag(name))
        .await
        .unwrap()
}

async fn put_in_category(store: &Store, category: CategoryId, series: Vec<SeriesId>, is_in: bool) {
    store
        .write(move |writer| writer.set_category_members(category, &series, is_in))
        .await
        .unwrap();
}

async fn put_with_tag(store: &Store, tag: TagId, series: Vec<SeriesId>, is_with: bool) {
    store
        .write(move |writer| writer.set_tag_members(tag, &series, is_with))
        .await
        .unwrap();
}

fn ids<T: Ord>(mut rows: Vec<T>) -> Vec<T> {
    rows.sort();
    rows
}

async fn labels(store: &Store) -> Labels {
    store
        .database()
        .read(|connection| {
            let categories = connection
                .prepare("SELECT category_id, name, position FROM category ORDER BY category_id")?
                .query_map([], |row| {
                    let id: Vec<u8> = row.get(0)?;
                    Ok((
                        CategoryId::try_from(id.as_slice()).unwrap(),
                        row.get(1)?,
                        row.get(2)?,
                    ))
                })?
                .collect::<Result<_, _>>()?;
            let tags = connection
                .prepare("SELECT tag_id, name FROM label_tag ORDER BY tag_id")?
                .query_map([], |row| {
                    let id: Vec<u8> = row.get(0)?;
                    Ok((TagId::try_from(id.as_slice()).unwrap(), row.get(1)?))
                })?
                .collect::<Result<_, _>>()?;
            let tag_norms = connection
                .prepare("SELECT tag_id, norm_name FROM label_tag ORDER BY tag_id")?
                .query_map([], |row| {
                    let id: Vec<u8> = row.get(0)?;
                    Ok((TagId::try_from(id.as_slice()).unwrap(), row.get(1)?))
                })?
                .collect::<Result<_, _>>()?;
            let in_category = connection
                .prepare("SELECT series_id, category_id FROM series_category")?
                .query_map([], |row| {
                    let series: Vec<u8> = row.get(0)?;
                    let category: Vec<u8> = row.get(1)?;
                    Ok((
                        SeriesId::try_from(series.as_slice()).unwrap(),
                        CategoryId::try_from(category.as_slice()).unwrap(),
                    ))
                })?
                .collect::<Result<_, _>>()?;
            let with_tag = connection
                .prepare("SELECT series_id, tag_id FROM series_label_tag")?
                .query_map([], |row| {
                    let series: Vec<u8> = row.get(0)?;
                    let tag: Vec<u8> = row.get(1)?;
                    Ok((
                        SeriesId::try_from(series.as_slice()).unwrap(),
                        TagId::try_from(tag.as_slice()).unwrap(),
                    ))
                })?
                .collect::<Result<_, _>>()?;
            Ok(Labels {
                categories,
                tags,
                tag_norms,
                in_category: ids(in_category),
                with_tag: ids(with_tag),
            })
        })
        .await
        .unwrap()
}

async fn forget_labels(store: &Store) {
    store
        .database()
        .write(|transaction| {
            for table in [
                "category",
                "label_tag",
                "series_category",
                "series_label_tag",
            ] {
                transaction.execute(&format!("DELETE FROM {table}"), [])?;
            }
            Ok(())
        })
        .await
        .unwrap();
}

#[tokio::test]
async fn keeps_a_category_under_its_name_and_after_the_categories_made_before_it() {
    let folder = ScratchFolder::new("labels-category");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));

    let first = create_category(&store, "Sample Shelf").await;
    let second = create_category(&store, "Other Name").await;

    let kept = labels(&store).await.categories;
    let position = |id| kept.iter().find(|row| row.0 == id).unwrap().2;
    assert_eq!(kept.len(), 2);
    assert!(position(first) < position(second));
    assert_eq!(first, category("sample  shelf"));
}

#[tokio::test]
async fn leaves_a_category_that_exists_as_it_is_when_its_name_is_made_again() {
    let folder = ScratchFolder::new("labels-category-twice");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
    create_category(&store, "Sample Shelf").await;
    create_category(&store, "Other Name").await;
    let before = labels(&store).await;

    create_category(&store, "sample shelf").await;

    assert_eq!(labels(&store).await, before);
}

#[tokio::test]
async fn keeps_the_series_put_in_a_category_and_not_one_taken_out() {
    let folder = ScratchFolder::new("labels-members");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
    let shelf = create_category(&store, "Sample Shelf").await;

    put_in_category(&store, shelf, vec![series(1), series(2), series(3)], true).await;
    put_in_category(&store, shelf, vec![series(2)], false).await;

    assert_eq!(
        labels(&store).await.in_category,
        ids(vec![(series(1), shelf), (series(3), shelf)])
    );
}

#[tokio::test]
async fn clears_the_memberships_of_a_deleted_category_and_starts_it_empty_when_made_again() {
    let folder = ScratchFolder::new("labels-delete-category");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
    let shelf = create_category(&store, "Sample Shelf").await;
    put_in_category(&store, shelf, vec![series(1), series(2)], true).await;

    store
        .write(move |writer| writer.delete_category(shelf))
        .await
        .unwrap();
    let after_delete = labels(&store).await;
    let again = create_category(&store, "Sample Shelf").await;
    forget_labels(&store).await;
    store.rebuild_projections().await.unwrap();

    assert_eq!(
        (after_delete.categories, after_delete.in_category),
        (vec![], vec![])
    );
    assert_eq!(again, shelf);
    let rebuilt = labels(&store).await;
    assert_eq!(rebuilt.categories.len(), 1);
    assert_eq!(rebuilt.in_category, []);
}

#[tokio::test]
async fn keeps_a_tag_under_its_name_and_the_series_that_carry_it() {
    let folder = ScratchFolder::new("labels-tag");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
    let sample = create_tag(&store, "Sample Tag").await;

    put_with_tag(&store, sample, vec![series(1), series(2)], true).await;

    let kept = labels(&store).await;
    assert_eq!(kept.tags, [(sample, "Sample Tag".to_owned())]);
    assert_eq!(
        kept.with_tag,
        ids(vec![(series(1), sample), (series(2), sample)])
    );
}

#[tokio::test]
async fn renames_a_tag_under_the_same_id_and_keeps_its_series() {
    let folder = ScratchFolder::new("labels-rename");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
    let old = create_tag(&store, "Sample Tag").await;
    put_with_tag(&store, old, vec![series(1), series(2)], true).await;

    let renamed = store
        .write(move |writer| writer.rename_tag(old, "Other Name"))
        .await
        .unwrap();

    let kept = labels(&store).await;
    assert_eq!(renamed, old);
    assert_eq!(kept.tags, [(old, "Other Name".to_owned())]);
    assert_eq!(kept.with_tag, ids(vec![(series(1), old), (series(2), old)]));
}

#[tokio::test]
async fn finds_a_renamed_tag_by_its_new_name_and_not_by_its_old_one() {
    let folder = ScratchFolder::new("labels-rename-find");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
    let old = create_tag(&store, "Sample Tag").await;
    store
        .write(move |writer| writer.rename_tag(old, "Other Name"))
        .await
        .unwrap();

    let by_new_name = create_tag(&store, "other  name").await;
    let found_by_old_name = store
        .write(|writer| writer.tag_named("Sample Tag"))
        .await
        .unwrap();

    assert_eq!(by_new_name, old);
    assert_eq!(found_by_old_name, None);
    assert_eq!(labels(&store).await.tags.len(), 1);
}

#[tokio::test]
async fn makes_a_new_tag_when_the_name_a_tag_was_renamed_away_from_is_used_again() {
    let folder = ScratchFolder::new("labels-rename-away");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
    let old = create_tag(&store, "Sample Tag").await;
    put_with_tag(&store, old, vec![series(1)], true).await;
    store
        .write(move |writer| writer.rename_tag(old, "Other Name"))
        .await
        .unwrap();

    let fresh = create_tag(&store, "Sample Tag").await;
    put_with_tag(&store, fresh, vec![series(2)], true).await;

    let kept = labels(&store).await;
    assert_ne!(fresh, old);
    assert_ne!(fresh, tag("Sample Tag"));
    assert_eq!(kept.tags.len(), 2);
    assert_eq!(
        kept.with_tag,
        ids(vec![(series(1), old), (series(2), fresh)])
    );
}

#[tokio::test]
async fn shows_a_series_added_to_a_tag_under_its_old_name_after_it_was_renamed() {
    let folder = ScratchFolder::new("labels-rename-late");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
    let old = create_tag(&store, "Sample Tag").await;
    store
        .write(move |writer| writer.rename_tag(old, "Other Name"))
        .await
        .unwrap();

    put_with_tag(&store, old, vec![series(1)], true).await;

    let kept = labels(&store).await;
    assert_eq!(kept.tags, [(old, "Other Name".to_owned())]);
    assert_eq!(kept.with_tag, [(series(1), old)]);
}

#[tokio::test]
async fn merges_a_tag_into_the_one_already_of_the_new_name() {
    let folder = ScratchFolder::new("labels-merge");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
    let old = create_tag(&store, "Sample Tag").await;
    let taken = create_tag(&store, "Other Name").await;
    put_with_tag(&store, old, vec![series(1), series(2)], true).await;
    put_with_tag(&store, taken, vec![series(2), series(3)], true).await;

    store
        .write(move |writer| writer.rename_tag(old, "other name"))
        .await
        .unwrap();

    let kept = labels(&store).await;
    assert_eq!(kept.tags, [(taken, "Other Name".to_owned())]);
    assert_eq!(
        kept.with_tag,
        ids(vec![
            (series(1), taken),
            (series(2), taken),
            (series(3), taken)
        ])
    );
}

#[tokio::test]
async fn changes_only_the_display_name_when_a_rename_keeps_the_normalised_name() {
    let folder = ScratchFolder::new("labels-rename-case");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
    let sample = create_tag(&store, "sample tag").await;
    put_with_tag(&store, sample, vec![series(1)], true).await;

    let renamed = store
        .write(move |writer| writer.rename_tag(sample, "Sample Tag"))
        .await
        .unwrap();

    let kept = labels(&store).await;
    assert_eq!(renamed, sample);
    assert_eq!(kept.tags, [(sample, "Sample Tag".to_owned())]);
    assert_eq!(kept.with_tag, [(series(1), sample)]);
}

#[tokio::test]
async fn gives_back_the_series_a_deleted_tag_carried() {
    let folder = ScratchFolder::new("labels-delete-tag");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
    let sample = create_tag(&store, "Sample Tag").await;
    put_with_tag(&store, sample, vec![series(2), series(1)], true).await;

    let carried = store
        .write(move |writer| writer.delete_tag(sample))
        .await
        .unwrap();

    assert_eq!(ids(carried), ids(vec![series(1), series(2)]));
    let kept = labels(&store).await;
    assert_eq!((kept.tags, kept.with_tag), (vec![], vec![]));
}

#[tokio::test]
async fn shows_each_profile_its_own_categories_and_tags() {
    let folder = ScratchFolder::new("labels-profiles");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
    let shelf = create_category(&store, "Sample Shelf").await;
    put_in_category(&store, shelf, vec![series(1)], true).await;
    store.switch_profile(another_profile()).await.unwrap();
    let in_another_profile = labels(&store).await;
    create_tag(&store, "Sample Tag").await;

    store
        .switch_profile(ProfileId::default_profile())
        .await
        .unwrap();

    assert_eq!(
        (
            in_another_profile.categories,
            in_another_profile.in_category
        ),
        (vec![], vec![])
    );
    let first = labels(&store).await;
    assert_eq!(first.categories.len(), 1);
    assert_eq!(first.in_category, [(series(1), shelf)]);
    assert_eq!(first.tags, []);
}

#[tokio::test]
async fn announces_the_registers_a_membership_changed() {
    let folder = ScratchFolder::new("labels-announced");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
    let shelf = create_category(&store, "Sample Shelf").await;
    let mut heard = store.subscribe();

    put_in_category(&store, shelf, vec![series(1)], true).await;

    let Changed::Registers { keys, recounted } = heard.recv().await.unwrap() else {
        panic!("expected registers");
    };
    assert_eq!(
        keys.into_iter().collect::<Vec<_>>(),
        [Key::from(LabelKey::SeriesCategory {
            series: series(1),
            category: shelf
        })]
    );
    assert!(!recounted);
}

#[tokio::test]
async fn records_a_membership_under_the_series_in_a_field_named_for_the_category() {
    let folder = ScratchFolder::new("labels-registers");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
    let shelf = create_category(&store, "Sample Shelf").await;

    put_in_category(&store, shelf, vec![series(1)], true).await;

    let fields = store
        .database()
        .read(|connection| {
            let mut statement = connection
                .prepare("SELECT entity, field FROM sync_register ORDER BY entity, field")?;
            let rows = statement
                .query_map([], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
                })?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(rows)
        })
        .await
        .unwrap();
    let hex = shelf.to_string().replace('-', "");
    assert_eq!(
        fields,
        [
            ("category".to_owned(), "deleted".to_owned()),
            ("category".to_owned(), "name".to_owned()),
            ("category".to_owned(), "order".to_owned()),
            ("series".to_owned(), format!("cat.{hex}")),
        ]
    );
}

async fn insert_register(
    store: &Store,
    entity: &'static str,
    id: [u8; 16],
    field: String,
    value: Value,
) {
    store
        .database()
        .write(move |transaction| {
            Ok(transaction.execute(
                "INSERT INTO sync_register (profile, entity, id, field, class, hlc, node, seq, value)
                 VALUES (?1, ?2, ?3, ?4, 'lww', 1, zeroblob(16), 1, ?5)",
                rusqlite::params![
                    ProfileId::default_profile().as_bytes(),
                    entity,
                    id,
                    field,
                    value.to_cbor()
                ],
            )?)
        })
        .await
        .unwrap();
}

#[tokio::test]
async fn leaves_out_a_register_holding_a_kind_of_value_its_field_cannot() {
    let folder = ScratchFolder::new("labels-malformed");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
    let shelf = create_category(&store, "Sample Shelf").await;
    let wrong = category("Other Name");
    insert_register(
        &store,
        "category",
        *wrong.as_bytes(),
        "name".to_owned(),
        Value::Bool(true),
    )
    .await;
    insert_register(
        &store,
        "category",
        *wrong.as_bytes(),
        "deleted".to_owned(),
        Value::Text("no".into()),
    )
    .await;
    insert_register(
        &store,
        "series",
        *series(1).as_bytes(),
        shelf.membership_field(),
        Value::Unsigned(1),
    )
    .await;
    let before = labels(&store).await;

    let rebuilt = store.rebuild_projections().await;

    assert!(rebuilt.is_ok(), "{rebuilt:?}");
    assert_eq!(labels(&store).await, before);
    assert_eq!(before.categories.len(), 1);
    assert_eq!(before.in_category, []);
}

#[tokio::test]
async fn keeps_a_series_added_after_its_category_was_deleted_out_of_every_listing() {
    let folder = ScratchFolder::new("labels-orphan");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
    let shelf = create_category(&store, "Sample Shelf").await;
    store
        .write(move |writer| writer.delete_category(shelf))
        .await
        .unwrap();

    put_in_category(&store, shelf, vec![series(1)], true).await;

    let kept = labels(&store).await;
    assert_eq!(kept.categories, []);
    assert_eq!(kept.in_category, [(series(1), shelf)]);
}

#[derive(Clone, Debug)]
enum LabelWrite {
    CreateCategory(&'static str),
    DeleteCategory(&'static str),
    InCategory {
        category: &'static str,
        series: u32,
        is_in: bool,
    },
    CreateTag(&'static str),
    DeleteTag(&'static str),
    RenameTag {
        tag: &'static str,
        to: &'static str,
    },
    WithTag {
        tag: &'static str,
        series: u32,
        is_with: bool,
    },
}

fn any_label_write() -> impl Strategy<Value = LabelWrite> {
    let name = select(NAMES.to_vec());
    prop_oneof![
        name.clone().prop_map(LabelWrite::CreateCategory),
        name.clone().prop_map(LabelWrite::DeleteCategory),
        (name.clone(), 0..3_u32, any::<bool>()).prop_map(|(category, series, is_in)| {
            LabelWrite::InCategory {
                category,
                series,
                is_in,
            }
        }),
        name.clone().prop_map(LabelWrite::CreateTag),
        name.clone().prop_map(LabelWrite::DeleteTag),
        (name.clone(), name.clone()).prop_map(|(tag, to)| LabelWrite::RenameTag { tag, to }),
        (name, 0..3_u32, any::<bool>()).prop_map(|(tag, series, is_with)| {
            LabelWrite::WithTag {
                tag,
                series,
                is_with,
            }
        }),
    ]
}

async fn apply(store: &Store, write: LabelWrite) {
    store
        .write(move |writer| match write {
            LabelWrite::CreateCategory(name) => writer.create_category(name).map(drop),
            LabelWrite::DeleteCategory(name) => writer.delete_category(category(name)),
            LabelWrite::InCategory {
                category: name,
                series: number,
                is_in,
            } => writer.set_category_members(category(name), &[series(number)], is_in),
            LabelWrite::CreateTag(name) => writer.create_tag(name).map(drop),
            LabelWrite::DeleteTag(name) => match writer.tag_named(name)? {
                Some(id) => writer.delete_tag(id).map(drop),
                None => Ok(()),
            },
            LabelWrite::RenameTag { tag: name, to } => match writer.tag_named(name)? {
                Some(id) => writer.rename_tag(id, to).map(drop),
                None => Ok(()),
            },
            LabelWrite::WithTag {
                tag: name,
                series: number,
                is_with,
            } => {
                let id = writer.tag_named(name)?.unwrap_or_else(|| tag(name));
                writer.set_tag_members(id, &[series(number)], is_with)
            }
        })
        .await
        .unwrap();
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(48))]

    #[test]
    fn rebuilding_from_the_registers_gives_what_applying_the_writes_one_by_one_gave(
        writes in vec(any_label_write(), 1..14)
    ) {
        let runtime = tokio::runtime::Builder::new_current_thread().build().unwrap();
        let (written, rebuilt) = runtime.block_on(async {
            let folder = ScratchFolder::new("labels-rebuild");
            let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
            for write in writes {
                apply(&store, write).await;
            }
            let written = labels(&store).await;
            forget_labels(&store).await;

            store.rebuild_projections().await.unwrap();

            (written, labels(&store).await)
        });

        prop_assert_eq!(rebuilt, written);
    }
}
