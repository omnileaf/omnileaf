#![expect(
    clippy::unwrap_used,
    reason = "each test opens its own library in a scratch folder, so a failed set-up should stop the test"
)]

mod support;

use omnileaf_engine::{
    CategoryId, LabelChanges, Library, LibraryCategory, LibraryListing, LibraryTag, SeriesId,
};
use omnileaf_testkit::{SAMPLE_LIBRARY_NAME, write_sample_library};
use support::{FixedClock, ScratchFolder};

struct Labelled {
    library: Library,
    series: Vec<(String, SeriesId)>,
    _home: ScratchFolder,
    _comics: ScratchFolder,
}

impl Labelled {
    async fn open(name: &str) -> Self {
        let comics = ScratchFolder::new(&format!("{name}-comics"));
        write_sample_library(comics.path()).unwrap();
        let home = ScratchFolder::new(&format!("{name}-home"));
        let library = Library::open(home.path().to_path_buf(), FixedClock)
            .await
            .unwrap();
        library
            .add_folder(comics.path().join(SAMPLE_LIBRARY_NAME), |_| {})
            .await
            .unwrap();
        let series = library
            .series(LibraryListing::default(), None)
            .await
            .unwrap()
            .series
            .into_iter()
            .map(|series| (series.title, series.id))
            .collect();
        Self {
            library,
            series,
            _home: home,
            _comics: comics,
        }
    }

    fn ids(&self, count: usize) -> Vec<SeriesId> {
        self.series.iter().take(count).map(|(_, id)| *id).collect()
    }

    fn titles(&self, count: usize) -> Vec<String> {
        let mut titles: Vec<String> = self
            .series
            .iter()
            .take(count)
            .map(|(title, _)| title.clone())
            .collect();
        titles.sort();
        titles
    }

    async fn label(&self, count: usize, changes: LabelChanges) {
        self.library
            .label_series(self.ids(count), changes)
            .await
            .unwrap();
    }

    async fn category(&self, name: &str) -> LibraryCategory {
        self.library
            .categories()
            .await
            .unwrap()
            .into_iter()
            .find(|category| category.name == name)
            .unwrap()
    }

    async fn tag(&self, name: &str) -> LibraryTag {
        self.library
            .tags()
            .await
            .unwrap()
            .into_iter()
            .find(|tag| tag.name == name)
            .unwrap()
    }

    async fn titles_in(&self, category: &CategoryId) -> Vec<String> {
        self.library
            .category_series(category.clone(), LibraryListing::default(), None)
            .await
            .unwrap()
            .series
            .into_iter()
            .map(|series| series.title)
            .collect()
    }
}

fn creating(name: &str) -> LabelChanges {
    LabelChanges {
        categories_created: vec![name.to_owned()],
        ..LabelChanges::default()
    }
}

fn tagging(name: &str) -> LabelChanges {
    LabelChanges {
        tags_added: vec![name.to_owned()],
        ..LabelChanges::default()
    }
}

#[tokio::test]
async fn keeps_no_categories_or_tags_in_a_new_library() {
    let labelled = Labelled::open("labels-none").await;

    let categories = labelled.library.categories().await.unwrap();
    let tags = labelled.library.tags().await.unwrap();
    let labels = labelled.library.series_labels(Vec::new()).await.unwrap();

    assert_eq!((categories, tags), (Vec::new(), Vec::new()));
    assert!(labels.keeps_labels);
}

#[tokio::test]
async fn makes_a_category_and_puts_the_series_in_it_in_one_write() {
    let labelled = Labelled::open("labels-create").await;

    labelled.label(2, creating("Sample Shelf")).await;

    let shelf = labelled.category("Sample Shelf").await;
    assert_eq!(labelled.titles_in(&shelf.id).await, labelled.titles(2));
    assert_eq!(
        labelled
            .library
            .category_series_count(shelf.id, LibraryListing::default().filter)
            .await
            .unwrap(),
        2
    );
}

#[tokio::test]
async fn takes_series_out_of_a_category_and_adds_others_with_one_call() {
    let labelled = Labelled::open("labels-move").await;
    labelled.label(2, creating("Sample Shelf")).await;
    labelled.label(0, creating("Other Shelf")).await;
    let shelf = labelled.category("Sample Shelf").await;
    let other = labelled.category("Other Shelf").await;
    let moved = LabelChanges {
        categories_removed: vec![shelf.id.clone()],
        categories_added: vec![other.id.clone()],
        tags_added: vec!["storms".to_owned()],
        ..LabelChanges::default()
    };
    labelled
        .library
        .label_series(labelled.ids(1), moved)
        .await
        .unwrap();

    let rest = labelled.titles_in(&shelf.id).await;
    let moved_to = labelled.titles_in(&other.id).await;

    assert_eq!(rest.len(), 1);
    assert!(!rest.contains(&labelled.series[0].0));
    assert_eq!(moved_to, labelled.titles(1));
    assert_eq!(labelled.tag("storms").await.series_count, 1);
}

#[tokio::test]
async fn keeps_a_label_removed_and_added_in_one_call() {
    let labelled = Labelled::open("labels-add-wins").await;
    labelled.label(0, creating("Sample Shelf")).await;
    labelled.label(0, tagging("storms")).await;
    let shelf = labelled.category("Sample Shelf").await;

    labelled
        .label(
            2,
            LabelChanges {
                categories_removed: vec![shelf.id.clone()],
                categories_added: vec![shelf.id.clone()],
                tags_removed: vec!["storms".to_owned()],
                tags_added: vec!["storms".to_owned()],
                ..LabelChanges::default()
            },
        )
        .await;

    assert_eq!(labelled.titles_in(&shelf.id).await, labelled.titles(2));
    assert_eq!(labelled.tag("storms").await.series_count, 2);
}

#[tokio::test]
async fn adds_series_to_a_category_that_exists_by_its_id() {
    let labelled = Labelled::open("labels-add").await;
    labelled.label(0, creating("Sample Shelf")).await;
    let shelf = labelled.category("Sample Shelf").await;

    labelled
        .label(
            3,
            LabelChanges {
                categories_added: vec![shelf.id.clone()],
                ..LabelChanges::default()
            },
        )
        .await;

    assert_eq!(labelled.titles_in(&shelf.id).await, labelled.titles(3));
}

#[tokio::test]
async fn ignores_a_category_the_library_does_not_keep() {
    let labelled = Labelled::open("labels-unknown").await;
    let unknown = CategoryId::from("not an id".to_owned());

    labelled
        .label(
            1,
            LabelChanges {
                categories_added: vec![unknown.clone()],
                ..LabelChanges::default()
            },
        )
        .await;

    let page = labelled
        .library
        .category_series(unknown.clone(), LibraryListing::default(), None)
        .await
        .unwrap();
    let count = labelled
        .library
        .category_series_count(unknown, LibraryListing::default().filter)
        .await
        .unwrap();
    assert_eq!(
        (page.series.len(), page.next.is_none(), count),
        (0, true, 0)
    );
    assert_eq!(labelled.library.categories().await.unwrap(), Vec::new());
}

#[tokio::test]
async fn lists_the_categories_in_the_order_they_were_made() {
    let labelled = Labelled::open("labels-order").await;
    for name in ["Zebra", "Apple", "Mango"] {
        labelled.label(0, creating(name)).await;
    }

    let names: Vec<String> = labelled
        .library
        .categories()
        .await
        .unwrap()
        .into_iter()
        .map(|category| category.name)
        .collect();

    assert_eq!(names, ["Zebra", "Apple", "Mango"]);
}

#[tokio::test]
async fn tells_how_many_of_the_series_asked_hold_each_category_and_tag() {
    let labelled = Labelled::open("labels-held").await;
    labelled.label(2, creating("Sample Shelf")).await;
    labelled.label(1, tagging("storms")).await;
    labelled.label(0, creating("Empty Shelf")).await;

    let labels = labelled
        .library
        .series_labels(labelled.ids(3))
        .await
        .unwrap();

    let held: Vec<(String, u32)> = labels
        .categories
        .iter()
        .map(|held| (held.category.name.clone(), held.holding))
        .collect();
    assert_eq!(
        held,
        [
            ("Sample Shelf".to_owned(), 2),
            ("Empty Shelf".to_owned(), 0)
        ]
    );
    assert_eq!(
        labels
            .tags
            .iter()
            .map(|held| (held.tag.as_str(), held.holding))
            .collect::<Vec<_>>(),
        [("storms", 1)]
    );
    assert!(labels.keeps_labels);
}

#[tokio::test]
async fn counts_the_series_carrying_each_tag() {
    let labelled = Labelled::open("labels-tag-count").await;
    labelled.label(3, tagging("storms")).await;
    labelled.label(1, tagging("harbour")).await;

    let storms = labelled.tag("storms").await;
    let harbour = labelled.tag("harbour").await;

    assert_eq!((storms.series_count, harbour.series_count), (3, 1));
}

#[tokio::test]
async fn renames_a_tag_and_keeps_its_series() {
    let labelled = Labelled::open("labels-tag-rename").await;
    labelled.label(2, tagging("storms")).await;

    labelled
        .library
        .rename_library_tag("storms".to_owned(), "weather".to_owned())
        .await
        .unwrap();

    assert_eq!(
        labelled.library.tags().await.unwrap(),
        [LibraryTag {
            name: "weather".to_owned(),
            series_count: 2
        }]
    );
    labelled.label(0, tagging("weather")).await;
    assert_eq!(labelled.library.tags().await.unwrap().len(), 1);
}

#[tokio::test]
async fn starts_a_new_tag_when_the_name_a_tag_was_renamed_away_from_is_used_again() {
    let labelled = Labelled::open("labels-tag-away").await;
    labelled.label(2, tagging("storms")).await;
    labelled
        .library
        .rename_library_tag("storms".to_owned(), "weather".to_owned())
        .await
        .unwrap();

    labelled.label(0, tagging("storms")).await;

    assert_eq!(labelled.tag("storms").await.series_count, 0);
    assert_eq!(labelled.tag("weather").await.series_count, 2);
}

#[tokio::test]
async fn merges_a_renamed_tag_into_the_tag_already_of_that_name() {
    let labelled = Labelled::open("labels-tag-merge").await;
    labelled.label(2, tagging("storms")).await;
    labelled
        .library
        .label_series(labelled.ids(3)[2..].to_vec(), tagging("weather"))
        .await
        .unwrap();

    labelled
        .library
        .rename_library_tag("storms".to_owned(), "Weather".to_owned())
        .await
        .unwrap();

    assert_eq!(
        labelled.library.tags().await.unwrap(),
        [LibraryTag {
            name: "weather".to_owned(),
            series_count: 3
        }]
    );
}

#[tokio::test]
async fn removes_a_tag_and_gives_back_the_series_that_carried_it() {
    let labelled = Labelled::open("labels-tag-remove").await;
    labelled.label(2, tagging("storms")).await;

    let carried = labelled
        .library
        .remove_library_tag("storms".to_owned())
        .await
        .unwrap();

    let mut expected = labelled.ids(2);
    let mut carried_ids = carried;
    expected.sort_by_key(|id| String::from(*id));
    carried_ids.sort_by_key(|id| String::from(*id));
    assert_eq!(carried_ids, expected);
    assert_eq!(labelled.library.tags().await.unwrap(), Vec::new());
}

#[tokio::test]
async fn removes_nothing_for_a_tag_the_library_does_not_keep() {
    let labelled = Labelled::open("labels-tag-unknown").await;

    let carried = labelled
        .library
        .remove_library_tag("storms".to_owned())
        .await
        .unwrap();
    labelled
        .library
        .rename_library_tag("storms".to_owned(), "weather".to_owned())
        .await
        .unwrap();

    assert_eq!(carried, Vec::new());
    assert_eq!(labelled.library.tags().await.unwrap(), Vec::new());
}

#[tokio::test]
async fn keeps_a_deleted_tag_empty_when_its_name_is_used_again() {
    let labelled = Labelled::open("labels-tag-again").await;
    labelled.label(2, tagging("storms")).await;
    labelled
        .library
        .remove_library_tag("storms".to_owned())
        .await
        .unwrap();

    labelled.label(0, tagging("storms")).await;

    assert_eq!(labelled.tag("storms").await.series_count, 0);
}
