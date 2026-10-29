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
        Cursor, Inclusion, PageRequest, PageSize, SeriesFilter, SeriesListing, SeriesOrder,
        SeriesSort, category_series_count, category_series_page, library_categories, library_tags,
        series_labels,
    },
    store::Store,
};
use omnileaf_sync_proto::{CategoryId, SeriesId};
use store_support::{FakeClock, NOW_UNIX_MS, open_store};
use support::ScratchFolder;

const A_TO_Z: SeriesListing = SeriesListing::unfiltered(SeriesSort::ascending(SeriesOrder::Title));
const TITLES: [&str; 4] = [
    "Sample Series 01",
    "Sample Series 02",
    "Sample Series 03",
    "Sample Series 04",
];

struct Library {
    store: Store,
    _folder: ScratchFolder,
}

impl Library {
    async fn with_series(name: &str) -> Self {
        let folder = ScratchFolder::new(name);
        let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
        let series: Vec<SeriesSeed<'_>> =
            TITLES.iter().map(|&name| SeriesSeed::named(name)).collect();
        seed_library(store.database(), &series).await;
        Self {
            store,
            _folder: folder,
        }
    }

    async fn category_of(&self, name: &'static str, members: &[&str]) -> CategoryId {
        let members: Vec<SeriesId> = members.iter().map(|title| series(title)).collect();
        self.store
            .write(move |writer| {
                let category = writer.create_category(name)?;
                writer.set_category_members(category, &members, true)?;
                Ok(category)
            })
            .await
            .unwrap()
    }

    async fn titles(
        &self,
        category: CategoryId,
        after: Option<Cursor>,
        size: u16,
    ) -> (Vec<String>, Option<Cursor>) {
        let request = PageRequest {
            after,
            size: PageSize::try_from(size).unwrap(),
        };
        let page = self
            .store
            .database()
            .read(move |connection| category_series_page(connection, category, &A_TO_Z, &request))
            .await
            .unwrap();
        (
            page.items.into_iter().map(|series| series.title).collect(),
            page.next,
        )
    }

    async fn count(&self, category: CategoryId, filter: SeriesFilter) -> u32 {
        self.store
            .database()
            .read(move |connection| category_series_count(connection, category, &filter))
            .await
            .unwrap()
    }

    async fn hide(&self, title: &'static str) {
        self.store
            .database()
            .write(move |transaction| {
                transaction.execute(
                    "UPDATE series SET is_out_of_reach = 1 WHERE title = ?1",
                    [title],
                )?;
                Ok(())
            })
            .await
            .unwrap();
    }

    async fn file_tag(&self, title: &'static str, name: &'static str) {
        self.store
            .database()
            .write(move |transaction| {
                transaction.execute(
                    "INSERT OR IGNORE INTO book_details (book_id)
                    SELECT book.id FROM book JOIN series ON series.local_id = book.series_local_id
                    WHERE series.title = ?1",
                    [title],
                )?;
                transaction.execute(
                    "INSERT OR IGNORE INTO book_tag (book_id, kind, name)
                    SELECT book.id, 'tag', ?2 FROM book
                    JOIN series ON series.local_id = book.series_local_id
                    WHERE series.title = ?1",
                    [title, name],
                )?;
                Ok(())
            })
            .await
            .unwrap();
    }
}

fn series(title: &str) -> SeriesId {
    SeriesId::local(title).unwrap()
}

fn owned(titles: &[&str]) -> Vec<String> {
    titles.iter().map(|&title| title.to_owned()).collect()
}

#[tokio::test]
async fn lists_only_the_series_in_the_category() {
    let library = Library::with_series("category-series").await;
    let shelf = library
        .category_of("Sample Shelf", &[TITLES[2], TITLES[0]])
        .await;
    library.category_of("Other Name", &[TITLES[1]]).await;

    let (titles, next) = library.titles(shelf, None, 10).await;

    assert_eq!(titles, owned(&[TITLES[0], TITLES[2]]));
    assert!(next.is_none());
}

#[tokio::test]
async fn pages_through_the_series_of_a_category() {
    let library = Library::with_series("category-series-pages").await;
    let shelf = library.category_of("Sample Shelf", &TITLES).await;

    let (first, next) = library.titles(shelf, None, 3).await;
    let (second, last) = library.titles(shelf, next, 3).await;

    assert_eq!(first, owned(&TITLES[..3]));
    assert_eq!(second, owned(&TITLES[3..]));
    assert!(last.is_none());
}

#[tokio::test]
async fn leaves_out_series_the_library_lacks_and_series_it_hides() {
    let library = Library::with_series("category-series-absent").await;
    let shelf = library
        .category_of("Sample Shelf", &[TITLES[0], TITLES[1], "Sample Series 99"])
        .await;
    library.hide(TITLES[1]).await;

    let (titles, _) = library.titles(shelf, None, 10).await;
    let counted = library.count(shelf, SeriesFilter::NONE).await;

    assert_eq!(titles, owned(&[TITLES[0]]));
    assert_eq!(counted, 1);
}

#[tokio::test]
async fn counts_the_series_of_a_category_that_meet_a_filter() {
    let library = Library::with_series("category-series-count").await;
    let shelf = library.category_of("Sample Shelf", &TITLES[..3]).await;

    let all = library.count(shelf, SeriesFilter::NONE).await;
    let unread = library
        .count(shelf, SeriesFilter::NONE.with_unread(Inclusion::Hide))
        .await;

    assert_eq!((all, unread), (3, 0));
}

#[tokio::test]
async fn lists_nothing_for_a_category_that_does_not_exist() {
    let library = Library::with_series("category-series-unknown").await;
    let unknown = CategoryId::from_name("Never Made").unwrap();

    let (titles, next) = library.titles(unknown, None, 10).await;

    assert_eq!((titles, next.is_none()), (vec![], true));
}

#[tokio::test]
async fn offers_no_category_a_series_was_added_to_after_the_category_was_deleted() {
    let library = Library::with_series("category-orphan").await;
    let shelf = library.category_of("Sample Shelf", &[TITLES[0]]).await;
    library
        .store
        .write(move |writer| writer.delete_category(shelf))
        .await
        .unwrap();
    library
        .store
        .write(move |writer| writer.set_category_members(shelf, &[series(TITLES[1])], true))
        .await
        .unwrap();
    let asked = [series(TITLES[1])];

    let categories = library
        .store
        .database()
        .read(library_categories)
        .await
        .unwrap();
    let held = library
        .store
        .database()
        .read(move |connection| series_labels(connection, &asked))
        .await
        .unwrap();

    assert_eq!(categories, []);
    assert_eq!(held.categories, []);
}

#[tokio::test]
async fn lists_the_categories_in_the_order_they_were_made() {
    let library = Library::with_series("category-order").await;
    library.category_of("Zebra", &[]).await;
    library.category_of("Apple", &[]).await;

    let names: Vec<String> = library
        .store
        .database()
        .read(library_categories)
        .await
        .unwrap()
        .into_iter()
        .map(|category| category.name)
        .collect();

    assert_eq!(names, owned(&["Zebra", "Apple"]));
}

#[tokio::test]
async fn counts_for_each_tag_the_shown_series_that_carry_it() {
    let library = Library::with_series("tag-counts").await;
    let tags = library
        .store
        .write(|writer| {
            let storms = writer.create_tag("storms")?;
            let harbour = writer.create_tag("Harbour")?;
            writer.create_tag("unused")?;
            writer.set_tag_members(
                storms,
                &[
                    series(TITLES[0]),
                    series(TITLES[1]),
                    series("Sample Series 99"),
                ],
                true,
            )?;
            writer.set_tag_members(harbour, &[series(TITLES[0])], true)?;
            Ok(())
        })
        .await;
    tags.unwrap();
    library.hide(TITLES[1]).await;

    let counted: Vec<(String, u32)> = library
        .store
        .database()
        .read(|connection| library_tags(connection, AdultHiding::default()))
        .await
        .unwrap()
        .into_iter()
        .map(|tag| (tag.name, tag.series_count))
        .collect();

    assert_eq!(
        counted,
        [("Harbour", 1), ("storms", 1), ("unused", 0)]
            .map(|(name, count)| (name.to_owned(), count))
    );
}

#[tokio::test]
async fn counts_how_many_of_the_series_asked_hold_each_category_and_tag() {
    let library = Library::with_series("series-labels").await;
    let shelf = library
        .category_of("Sample Shelf", &[TITLES[0], TITLES[1]])
        .await;
    library.category_of("Other Name", &[]).await;
    library
        .store
        .write(|writer| {
            let storms = writer.create_tag("storms")?;
            writer.set_tag_members(storms, &[series(TITLES[0])], true)
        })
        .await
        .unwrap();
    let asked = [series(TITLES[0]), series(TITLES[1]), series(TITLES[2])];

    let held = library
        .store
        .database()
        .read(move |connection| series_labels(connection, &asked))
        .await
        .unwrap();

    let categories: Vec<(String, u32)> = held
        .categories
        .iter()
        .map(|held| (held.category.name.clone(), held.holding))
        .collect();
    let tags: Vec<(String, u32)> = held
        .tags
        .iter()
        .map(|held| (held.tag.clone(), held.holding))
        .collect();
    assert_eq!(
        categories,
        [("Sample Shelf", 2), ("Other Name", 0)].map(|(name, count)| (name.to_owned(), count))
    );
    assert_eq!(tags, [("storms".to_owned(), 1)]);
    assert!(held.categories.iter().any(|held| held.category.id == shelf));
}

#[tokio::test]
async fn suggests_the_most_common_tags_of_the_files_that_the_series_do_not_carry_yet() {
    let library = Library::with_series("series-label-suggestions").await;
    for title in [TITLES[0], TITLES[1]] {
        library.file_tag(title, "harbour").await;
    }
    library.file_tag(TITLES[0], "storms").await;
    library.file_tag(TITLES[0], "Quiet").await;
    library
        .store
        .write(|writer| {
            let quiet = writer.create_tag("quiet")?;
            writer.set_tag_members(quiet, &[series(TITLES[0])], true)
        })
        .await
        .unwrap();
    let asked = [series(TITLES[0]), series(TITLES[1])];

    let held = library
        .store
        .database()
        .read(move |connection| series_labels(connection, &asked))
        .await
        .unwrap();

    assert_eq!(held.suggested_tags, owned(&["harbour", "storms"]));
}

const FEW_IN_CATEGORY: usize = 1_500;

async fn pages_of_a_category_of(members: usize) -> Vec<String> {
    let folder = ScratchFolder::new("category-series-boundary");
    let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
    let titles: Vec<String> = (0..members)
        .map(|number| format!("Sample Series {number:05}"))
        .collect();
    let seeds: Vec<SeriesSeed<'_>> = titles
        .iter()
        .map(|title| SeriesSeed::named(title))
        .collect();
    seed_library(store.database(), &seeds).await;
    let ids: Vec<SeriesId> = titles.iter().map(|title| series(title)).collect();
    let shelf = store
        .write(move |writer| {
            let category = writer.create_category("Sample Shelf")?;
            writer.set_category_members(category, &ids, true)?;
            Ok(category)
        })
        .await
        .unwrap();
    let mut read = Vec::new();
    let mut after = None;
    loop {
        let request = PageRequest {
            after: after.take(),
            size: PageSize::try_from(200).unwrap(),
        };
        let page = store
            .database()
            .read(move |connection| category_series_page(connection, shelf, &A_TO_Z, &request))
            .await
            .unwrap();
        read.extend(page.items.into_iter().map(|series| series.title));
        let Some(next) = page.next else { break };
        after = Some(next);
    }
    assert_eq!(read, titles);
    read
}

#[tokio::test]
async fn pages_a_category_one_short_of_the_few_in_order() {
    pages_of_a_category_of(FEW_IN_CATEGORY - 1).await;
}

#[tokio::test]
async fn pages_a_category_of_exactly_the_few_in_order() {
    pages_of_a_category_of(FEW_IN_CATEGORY).await;
}
