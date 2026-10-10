#![expect(
    clippy::unwrap_used,
    reason = "each test opens its own library in a scratch folder, so a failed set-up should stop the test"
)]

#[expect(
    dead_code,
    reason = "these tests need scratch folders but none of the files support can put in them"
)]
mod support;

use omnileaf_engine::{
    BookReading, BooksShown, Changed, Library, LibraryError, LibraryListing, ReadMark, SeriesBook,
    SeriesBookListing, SeriesId, SortDirection,
};
use omnileaf_testkit::{SAMPLE_LIBRARY_NAME, write_sample_library};
use support::{FixedClock, ScratchFolder};

const FIRST_SERIES: &str = "Sample Series 01";
const ADDED_AT_MS: i64 = 1_790_000_000_000;

struct SampleLibrary {
    library: Library,
    _comics: ScratchFolder,
    _home: ScratchFolder,
}

impl SampleLibrary {
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
        Self {
            library,
            _comics: comics,
            _home: home,
        }
    }

    async fn series_named(&self, title: &str) -> SeriesId {
        let page = self
            .library
            .series(LibraryListing::default(), None)
            .await
            .unwrap();
        page.series
            .into_iter()
            .find(|series| series.title == title)
            .unwrap()
            .id
    }

    async fn books(&self, series: SeriesId) -> Vec<SeriesBook> {
        self.listed_books(series, SeriesBookListing::default())
            .await
    }

    async fn listed_books(&self, series: SeriesId, listing: SeriesBookListing) -> Vec<SeriesBook> {
        self.library
            .series_books(series, listing, None)
            .await
            .unwrap()
            .books
    }
}

fn titles_and_readings(books: &[SeriesBook]) -> Vec<(&str, BookReading)> {
    books
        .iter()
        .map(|book| (book.title.as_str(), book.reading))
        .collect()
}

#[tokio::test]
async fn sums_up_a_series_with_its_cover_folder_and_first_book_up_next() {
    let sample = SampleLibrary::open("overview-of-new-series").await;
    let series = sample.series_named(FIRST_SERIES).await;

    let overview = sample.library.series_overview(series).await.unwrap();

    let up_next = overview.up_next.unwrap();
    assert_eq!(
        (
            overview.title.as_str(),
            overview.book_count,
            overview.read_count,
            overview.cover.is_some(),
            overview.folder.as_deref(),
            up_next.title.as_str(),
            up_next.reading,
        ),
        (
            FIRST_SERIES,
            3,
            0,
            true,
            Some(SAMPLE_LIBRARY_NAME),
            "Sample Series 01 v01",
            BookReading::NotStarted,
        )
    );
}

#[tokio::test]
async fn lists_a_series_books_in_order_with_when_each_was_added() {
    let sample = SampleLibrary::open("books-of-series").await;
    let series = sample.series_named(FIRST_SERIES).await;

    let books = sample.books(series).await;

    let listed: Vec<(&str, i64, BookReading)> = books
        .iter()
        .map(|book| (book.title.as_str(), book.added_at_ms, book.reading))
        .collect();
    assert_eq!(
        listed,
        [
            ("Sample Series 01 v01", ADDED_AT_MS, BookReading::NotStarted),
            ("Sample Series 01 v02", ADDED_AT_MS, BookReading::NotStarted),
            ("Sample Series 01 v03", ADDED_AT_MS, BookReading::NotStarted),
        ]
    );
}

#[tokio::test]
async fn lists_only_a_series_books_not_read_the_other_way_round_numbered_by_place() {
    let sample = SampleLibrary::open("unread-books-reversed").await;
    let series = sample.series_named(FIRST_SERIES).await;
    let books = sample.books(series).await;
    sample
        .library
        .mark_books(vec![books[1].id], ReadMark::Read)
        .await
        .unwrap();
    let unread_reversed = SeriesBookListing {
        shown: BooksShown::Unread,
        direction: SortDirection::Descending,
    };

    let listed = sample.listed_books(series, unread_reversed).await;

    let numbered: Vec<(&str, u32)> = listed
        .iter()
        .map(|book| (book.title.as_str(), book.position))
        .collect();
    assert_eq!(
        numbered,
        [("Sample Series 01 v03", 3), ("Sample Series 01 v01", 1)]
    );
}

#[tokio::test]
async fn refuses_an_overview_of_a_series_the_library_does_not_hold() {
    let elsewhere = SampleLibrary::open("overview-of-missing-series").await;
    let series = elsewhere.series_named(FIRST_SERIES).await;
    let home = ScratchFolder::new("overview-of-missing-series-empty-home");
    let empty = Library::open(home.path().to_path_buf(), FixedClock)
        .await
        .unwrap();

    let outcome = empty.series_overview(series).await;

    assert!(
        matches!(outcome, Err(LibraryError::SeriesNotFound { id }) if id == series),
        "{outcome:?}"
    );
}

#[tokio::test]
async fn marks_books_read_and_moves_what_is_up_next_past_them() {
    let sample = SampleLibrary::open("mark-books-read").await;
    let series = sample.series_named(FIRST_SERIES).await;
    let books = sample.books(series).await;
    let first_two = vec![books[0].id, books[1].id];

    sample
        .library
        .mark_books(first_two, ReadMark::Read)
        .await
        .unwrap();

    let overview = sample.library.series_overview(series).await.unwrap();
    assert_eq!(
        (
            titles_and_readings(&sample.books(series).await),
            overview.read_count,
            overview.up_next.map(|book| book.title),
        ),
        (
            vec![
                ("Sample Series 01 v01", BookReading::Read),
                ("Sample Series 01 v02", BookReading::Read),
                ("Sample Series 01 v03", BookReading::NotStarted),
            ],
            2,
            Some("Sample Series 01 v03".to_owned()),
        )
    );
}

#[tokio::test]
async fn marks_books_unread_again_and_counts_them_unread_in_the_library() {
    let sample = SampleLibrary::open("mark-books-unread").await;
    let series = sample.series_named(FIRST_SERIES).await;
    let ids: Vec<_> = sample
        .books(series)
        .await
        .iter()
        .map(|book| book.id)
        .collect();
    sample
        .library
        .mark_books(ids.clone(), ReadMark::Read)
        .await
        .unwrap();

    sample
        .library
        .mark_books(vec![ids[2]], ReadMark::Unread)
        .await
        .unwrap();

    let listed = sample
        .library
        .series(LibraryListing::default(), None)
        .await
        .unwrap();
    let unread = listed
        .series
        .iter()
        .find(|one| one.id == series)
        .unwrap()
        .unread_count;
    assert_eq!(
        (titles_and_readings(&sample.books(series).await), unread),
        (
            vec![
                ("Sample Series 01 v01", BookReading::Read),
                ("Sample Series 01 v02", BookReading::Read),
                ("Sample Series 01 v03", BookReading::NotStarted),
            ],
            1,
        )
    );
}

#[tokio::test]
async fn announces_the_books_marked_as_a_synced_change() {
    let sample = SampleLibrary::open("mark-books-announced").await;
    let series = sample.series_named(FIRST_SERIES).await;
    let first = sample.books(series).await[0].id;
    let mut changes = sample.library.subscribe();

    sample
        .library
        .mark_books(vec![first], ReadMark::Read)
        .await
        .unwrap();

    let announced = changes.try_recv().unwrap();
    assert!(
        matches!(&announced, Changed::Registers { keys, recounted: true } if keys.len() == 1),
        "{announced:?}"
    );
}
