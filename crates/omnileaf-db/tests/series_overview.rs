#![expect(
    clippy::unwrap_used,
    reason = "each test builds its own scratch library, so a failed set-up should stop the test"
)]

mod library_seed;
mod support;

use std::path::{Path, PathBuf};

use library_seed::{SeriesSeed, fingerprint, seed_library};
use omnileaf_db::{
    Database,
    catalog::{
        AndroidTree, AppleBookmark, BookDetails, BookFile, BookReading, NewRoot, NewSeries, RootId,
        RootKind, RootLocator, ScannedBook, SeriesFolder, SeriesNaming, SeriesOverview, Sourced,
        TreeUri, ValueSource, add_root, record_scanned_books, series_overview, up_next,
    },
};
use omnileaf_sync_proto::SeriesId;
use support::{ScratchFolder, library_config};

const ADDED_AT_MS: i64 = 1_790_000_000_000;
const ROOT_FOLDER: &str = "/media/Sample Library";
const COMICS_TREE: &str = "content://documents.test/tree/primary%3ADocuments%2FComics";
const SERIES_YEAR: u16 = 2019;
const TAGGED_LANGUAGE: &str = "ja";
const FOLDER_BOOKMARK: &[u8] = b"bookmark of the sample library";
const SERIES: &str = "Sample Series 01";
const FIVE_VOLUMES: &[&str] = &[
    "Volume 01",
    "Volume 02",
    "Volume 03",
    "Volume 04",
    "Volume 05",
];

type BookState<'a> = (&'a str, Option<u32>, Option<u32>, Option<bool>);

fn holding<'a>(name: &'a str, book_titles: &'a [&'a str]) -> SeriesSeed<'a> {
    SeriesSeed {
        added_at_ms: ADDED_AT_MS,
        book_titles,
        ..SeriesSeed::named(name)
    }
}

struct Library {
    database: Database,
    _folder: ScratchFolder,
}

impl Library {
    async fn with(series: &[SeriesSeed<'_>]) -> Self {
        let folder = ScratchFolder::new("series-overview");
        let database = Database::open(&library_config(&folder)).unwrap();
        seed_library(&database, series).await;
        Self {
            database,
            _folder: folder,
        }
    }

    async fn with_files(titles: &[&str]) -> Self {
        Self::with_files_in(RootLocator::Path(PathBuf::from(ROOT_FOLDER)), titles).await
    }

    async fn with_files_in(folder: RootLocator, titles: &[&str]) -> Self {
        Self::with_books_in(folder, titles, &Placing::by_name()).await
    }

    async fn with_books_in(folder: RootLocator, titles: &[&str], placing: &Placing) -> Self {
        let library = Self::with(&[]).await;
        let root = library.add_root(folder).await;
        let scanned: Vec<ScannedBook> = titles
            .iter()
            .map(|&title| ScannedBook {
                series: placing.series.clone(),
                named_series: None,
                fingerprint: fingerprint(SERIES, title),
                title: title.to_owned(),
                added_at_ms: ADDED_AT_MS,
                page_count: 1,
                details: BookDetails::default(),
                file: BookFile {
                    root,
                    location: PathBuf::from(SERIES).join(format!("{title}.cbz")),
                    size_bytes: 1,
                    modified_at_ms: ADDED_AT_MS,
                },
                numbering: None,
                name_language: placing.name_language.clone(),
            })
            .collect();
        library
            .database
            .write(move |transaction| record_scanned_books(transaction, &scanned))
            .await
            .unwrap();
        library
    }

    async fn add_root(&self, locator: RootLocator) -> RootId {
        let root = NewRoot {
            kind: RootKind::Linked,
            locator,
            added_at_ms: ADDED_AT_MS,
        };
        self.database
            .write(move |transaction| add_root(transaction, &root))
            .await
            .unwrap()
    }

    async fn set_states(&self, states: &[BookState<'static>]) {
        let states = states.to_vec();
        self.database
            .write(move |transaction| {
                let mut state = transaction.prepare(
                    "INSERT INTO book_state (book_id, position_page, furthest_page, is_read)
                    SELECT book.id, ?2, ?3, ?4 FROM book WHERE book.title = ?1",
                )?;
                for row in &states {
                    state.execute(*row)?;
                }
                Ok(())
            })
            .await
            .unwrap();
    }

    async fn overview(&self, series: &str) -> Option<SeriesOverview> {
        self.overview_of(series_id(series)).await
    }

    async fn overview_of(&self, id: SeriesId) -> Option<SeriesOverview> {
        self.database
            .read(move |connection| series_overview(connection, id))
            .await
            .unwrap()
    }

    async fn up_next(&self) -> Option<(String, BookReading)> {
        let id = series_id(SERIES);
        self.database
            .read(move |connection| up_next(connection, id))
            .await
            .unwrap()
            .map(|book| (book.title, book.reading))
    }
}

struct Placing {
    series: NewSeries,
    name_language: Option<String>,
}

impl Placing {
    fn by_name() -> Self {
        Self {
            series: NewSeries::local(SERIES, ADDED_AT_MS).unwrap(),
            name_language: None,
        }
    }

    fn tagged_in_a_dated_folder() -> Self {
        let naming = SeriesNaming {
            title: Sourced {
                value: SERIES.to_owned(),
                source: ValueSource::FolderName,
            },
            year: Some(Sourced {
                value: SERIES_YEAR,
                source: ValueSource::FolderName,
            }),
        };
        let folder = SeriesFolder {
            linked_folder: "Sample Library",
            location: Path::new(SERIES),
        };
        Self {
            series: NewSeries::folder(folder, naming, ADDED_AT_MS).unwrap(),
            name_language: Some(TAGGED_LANGUAGE.to_owned()),
        }
    }
}

fn comics_tree() -> AndroidTree {
    AndroidTree::new(
        TreeUri::parse(COMICS_TREE.to_owned()).unwrap(),
        "Comics".to_owned(),
        "Internal storage › Documents".to_owned(),
    )
    .unwrap()
}

fn bookmarked_folder() -> RootLocator {
    RootLocator::AppleBookmark {
        path: PathBuf::from(ROOT_FOLDER),
        bookmark: AppleBookmark::new(FOLDER_BOOKMARK.to_vec()),
    }
}

fn series_id(name: &str) -> SeriesId {
    NewSeries::local(name, 0).unwrap().id()
}

#[tokio::test]
async fn sums_up_a_series_by_its_title_books_and_books_read() {
    let library = Library::with(&[holding(SERIES, FIVE_VOLUMES)]).await;
    library
        .set_states(&[
            ("Volume 01", Some(20), Some(20), Some(true)),
            ("Volume 02", Some(20), Some(20), Some(true)),
            ("Volume 03", Some(4), None, None),
        ])
        .await;

    let overview = library.overview(SERIES).await.unwrap();

    assert_eq!(
        overview,
        SeriesOverview {
            id: series_id(SERIES),
            title: SERIES.to_owned(),
            file_title: SERIES.to_owned(),
            title_source: None,
            year: None,
            language: None,
            book_count: 5,
            read_count: 2,
            cover: None,
            folder: None,
            pages_left: None,
            is_rated_adult: false,
            is_marked_adult: false,
            bookmark_count: 0,
        }
    );
}

#[tokio::test]
async fn counts_a_book_with_several_bookmarks_once_in_the_overview_of_its_series() {
    let library = Library::with(&[holding(SERIES, FIVE_VOLUMES)]).await;
    library
        .database
        .write(|transaction| {
            transaction.execute_batch(
                "INSERT INTO book_bookmark (book_id, page)
                    SELECT id, 1 FROM book WHERE title IN ('Volume 01', 'Volume 02');
                 INSERT INTO book_bookmark (book_id, page)
                    SELECT id, 4 FROM book WHERE title = 'Volume 01'",
            )?;
            Ok(())
        })
        .await
        .unwrap();

    let overview = library.overview(SERIES).await.unwrap();

    assert_eq!(overview.bookmark_count, 2);
}

#[tokio::test]
async fn names_where_the_title_year_and_language_of_a_series_came_from() {
    let placing = Placing::tagged_in_a_dated_folder();
    let library = Library::with_books_in(
        RootLocator::Path(PathBuf::from(ROOT_FOLDER)),
        &["Volume 01"],
        &placing,
    )
    .await;

    let overview = library.overview_of(placing.series.id()).await.unwrap();

    assert_eq!(
        (overview.title_source, overview.year, overview.language),
        (
            Some(ValueSource::FolderName),
            Some(Sourced {
                value: SERIES_YEAR,
                source: ValueSource::FolderName,
            }),
            Some(Sourced {
                value: TAGGED_LANGUAGE.to_owned(),
                source: ValueSource::FileName,
            }),
        )
    );
}

#[tokio::test]
async fn shows_a_series_with_the_cover_the_library_gives_it_and_the_folder_holding_that_file() {
    let library = Library::with_files(&["Volume 02", "Volume 01"]).await;

    let overview = library.overview(SERIES).await.unwrap();

    let cover = overview.cover.unwrap();
    assert_eq!(
        (cover.book, overview.folder),
        (
            omnileaf_sync_proto::BookId::local(&fingerprint(SERIES, "Volume 01")),
            Some(RootLocator::Path(PathBuf::from(ROOT_FOLDER))),
        )
    );
}

#[tokio::test]
async fn names_the_android_folder_holding_the_cover_of_a_series() {
    let library =
        Library::with_files_in(RootLocator::AndroidTree(comics_tree()), &["Volume 01"]).await;

    let overview = library.overview(SERIES).await.unwrap();

    assert_eq!(
        overview.folder,
        Some(RootLocator::AndroidTree(comics_tree()))
    );
}

#[tokio::test]
async fn names_the_bookmarked_folder_holding_the_cover_of_a_series() {
    let library = Library::with_files_in(bookmarked_folder(), &["Volume 01"]).await;

    let overview = library.overview(SERIES).await.unwrap();

    assert_eq!(overview.folder, Some(bookmarked_folder()));
}

#[tokio::test]
async fn finds_no_overview_of_a_series_the_library_does_not_show() {
    let library = Library::with(&[holding("Sample Series 02", &[])]).await;

    let overviews = [
        library.overview("Sample Series 02").await,
        library.overview("Sample Series 09").await,
    ];

    assert_eq!(overviews, [None, None]);
}

#[tokio::test]
async fn goes_on_with_the_first_book_started_and_not_read() {
    let library = Library::with(&[holding(SERIES, FIVE_VOLUMES)]).await;
    library
        .set_states(&[
            ("Volume 01", Some(20), Some(20), Some(true)),
            ("Volume 02", None, None, Some(false)),
            ("Volume 03", None, Some(9), None),
            ("Volume 04", Some(6), Some(6), None),
        ])
        .await;

    let next = library.up_next().await;

    assert_eq!(
        next,
        Some((
            "Volume 03".to_owned(),
            BookReading::Started {
                position_page: None
            }
        ))
    );
}

#[tokio::test]
async fn starts_the_first_book_not_read_when_none_is_started() {
    let library = Library::with(&[holding(SERIES, FIVE_VOLUMES)]).await;
    library
        .set_states(&[
            ("Volume 01", Some(20), Some(20), Some(true)),
            ("Volume 03", None, None, Some(true)),
        ])
        .await;

    let next = library.up_next().await;

    assert_eq!(
        next,
        Some(("Volume 02".to_owned(), BookReading::NotStarted))
    );
}

#[tokio::test]
async fn has_nothing_up_next_once_every_book_is_read() {
    let library = Library::with(&[holding(SERIES, &["Volume 01", "Volume 02"])]).await;
    library
        .set_states(&[
            ("Volume 01", Some(20), Some(20), Some(true)),
            ("Volume 02", None, None, Some(true)),
        ])
        .await;

    let next = library.up_next().await;

    assert_eq!(next, None);
}
