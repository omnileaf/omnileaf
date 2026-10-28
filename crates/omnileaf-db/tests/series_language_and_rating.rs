#![expect(
    clippy::unwrap_used,
    reason = "each test builds its own scratch library, so a failed set-up should stop the test"
)]

mod support;

use std::path::PathBuf;

use omnileaf_db::{
    Database,
    catalog::{
        AgeRating, BookDetails, BookFile, NewRoot, NewSeries, PageRequest, PageSize, RootId,
        RootKind, RootLocator, ScannedBook, SeriesListing, SeriesOrder, SeriesSort, add_root,
        record_moved_books, record_scanned_books, remove_book_files, remove_books_without_files,
        series_page,
    },
};
use omnileaf_sync_proto::{Fingerprint, ImageEntry};
use support::{ScratchFolder, library_config};

const ADDED_AT_MS: i64 = 1_790_000_000_000;
const SERIES_01: &str = "Sample Series 01";
const SERIES_02: &str = "Sample Series 02";

struct Library {
    database: Database,
    root: RootId,
    _folder: ScratchFolder,
}

impl Library {
    async fn open(name: &str) -> Self {
        let folder = ScratchFolder::new(name);
        let database = Database::open(&library_config(&folder)).unwrap();
        let root = NewRoot {
            kind: RootKind::Linked,
            locator: RootLocator::Path(PathBuf::from("/media/Sample Library")),
            added_at_ms: ADDED_AT_MS,
        };
        let root = database
            .write(move |transaction| add_root(transaction, &root))
            .await
            .unwrap();
        Self {
            database,
            root,
            _folder: folder,
        }
    }

    fn book(&self, series: &str, volume: u32, details: BookDetails) -> ScannedBook {
        ScannedBook {
            series: NewSeries::local(series, ADDED_AT_MS).unwrap(),
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
                root: self.root,
                location: PathBuf::from(format!("{series}/Volume {volume:02}.cbz")),
                size_bytes: 1,
                modified_at_ms: ADDED_AT_MS,
            },
            numbering: None,
        }
    }

    async fn record(&self, books: Vec<ScannedBook>) {
        self.database
            .write(move |transaction| record_scanned_books(transaction, &books))
            .await
            .unwrap();
    }

    async fn record_moved(&self, books: Vec<ScannedBook>) {
        self.database
            .write(move |transaction| record_moved_books(transaction, &books))
            .await
            .unwrap();
    }

    async fn remove(&self, series: &str, volume: u32) {
        let root = self.root;
        let location = PathBuf::from(format!("{series}/Volume {volume:02}.cbz"));
        self.database
            .write(move |transaction| {
                let books = remove_book_files(transaction, root, &[location])?;
                remove_books_without_files(transaction, &books)
            })
            .await
            .unwrap();
    }

    async fn forget_details(&self) {
        self.database
            .write(|transaction| Ok(transaction.execute("DELETE FROM book_details", [])?))
            .await
            .unwrap();
    }

    async fn listed(&self) -> Vec<(String, Option<String>, bool)> {
        let request = PageRequest {
            after: None,
            size: PageSize::try_from(10).unwrap(),
        };
        let listing = SeriesListing::unfiltered(SeriesSort::ascending(SeriesOrder::Title));
        self.database
            .read(move |connection| series_page(connection, &listing, &request))
            .await
            .unwrap()
            .items
            .into_iter()
            .map(|series| (series.title, series.language, series.is_rated_adult))
            .collect()
    }
}

fn in_language(language: &str) -> BookDetails {
    BookDetails {
        language: Some(language.to_owned()),
        ..BookDetails::default()
    }
}

fn rated(rating: AgeRating) -> BookDetails {
    BookDetails {
        age_rating: Some(rating),
        ..BookDetails::default()
    }
}

fn listed(
    title: &str,
    language: Option<&str>,
    is_rated_adult: bool,
) -> (String, Option<String>, bool) {
    (
        title.to_owned(),
        language.map(str::to_owned),
        is_rated_adult,
    )
}

#[tokio::test]
async fn names_a_series_in_the_language_of_its_first_book_to_give_one() {
    let library = Library::open("series-language").await;

    library
        .record(vec![
            library.book(SERIES_01, 3, in_language("en")),
            library.book(SERIES_01, 1, BookDetails::default()),
            library.book(SERIES_01, 2, in_language("ja")),
        ])
        .await;

    assert_eq!(
        library.listed().await,
        [listed(SERIES_01, Some("ja"), false)]
    );
}

#[tokio::test]
async fn rates_a_series_18_plus_when_any_of_its_books_carries_an_adult_rating() {
    let library = Library::open("series-rating").await;

    library
        .record(vec![
            library.book(SERIES_01, 1, rated(AgeRating::Teen)),
            library.book(SERIES_01, 2, rated(AgeRating::R18)),
            library.book(SERIES_02, 3, rated(AgeRating::Mature17)),
        ])
        .await;

    assert_eq!(
        library.listed().await,
        [
            listed(SERIES_01, None, true),
            listed(SERIES_02, None, false)
        ]
    );
}

#[tokio::test]
async fn takes_a_series_language_and_rating_again_from_a_book_scanned_with_new_details() {
    let library = Library::open("series-details-rescanned").await;
    let adult_in_english = BookDetails {
        age_rating: Some(AgeRating::AdultsOnly18),
        ..in_language("en")
    };
    library
        .record(vec![library.book(SERIES_01, 1, adult_in_english)])
        .await;

    library
        .record(vec![library.book(SERIES_01, 1, in_language("fr"))])
        .await;

    assert_eq!(
        library.listed().await,
        [listed(SERIES_01, Some("fr"), false)]
    );
}

#[tokio::test]
async fn takes_a_series_language_and_rating_from_the_books_left_when_one_goes() {
    let library = Library::open("series-details-removed").await;
    let adult_in_english = BookDetails {
        age_rating: Some(AgeRating::X18),
        ..in_language("en")
    };
    library
        .record(vec![
            library.book(SERIES_01, 1, adult_in_english),
            library.book(SERIES_01, 2, in_language("ja")),
        ])
        .await;

    library.remove(SERIES_01, 1).await;

    assert_eq!(
        library.listed().await,
        [listed(SERIES_01, Some("ja"), false)]
    );
}

#[tokio::test]
async fn moves_a_book_s_language_and_rating_to_the_series_it_moves_to() {
    let library = Library::open("series-details-moved").await;
    let adult_in_english = BookDetails {
        age_rating: Some(AgeRating::AdultsOnly18),
        ..in_language("en")
    };
    library
        .record(vec![
            library.book(SERIES_01, 1, adult_in_english.clone()),
            library.book(SERIES_01, 2, BookDetails::default()),
        ])
        .await;

    library
        .record_moved(vec![library.book(SERIES_02, 1, adult_in_english)])
        .await;

    assert_eq!(
        library.listed().await,
        [
            listed(SERIES_01, None, false),
            listed(SERIES_02, Some("en"), true)
        ]
    );
}

#[tokio::test]
async fn forgets_a_series_language_and_rating_when_its_books_details_are_forgotten() {
    let library = Library::open("series-details-forgotten").await;
    let adult_in_english = BookDetails {
        age_rating: Some(AgeRating::R18),
        ..in_language("en")
    };
    library
        .record(vec![library.book(SERIES_01, 1, adult_in_english.clone())])
        .await;
    library.forget_details().await;

    library
        .record(vec![library.book(SERIES_01, 1, adult_in_english)])
        .await;
    library.forget_details().await;

    assert_eq!(library.listed().await, [listed(SERIES_01, None, false)]);
}
