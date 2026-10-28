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
    adult_content::AdultHiding,
    catalog::{
        AgeRating, BookDetails, BookFile, BookPerson, FolderGroup, NewRoot, NewSeries, PageRequest,
        PageSize, PersonRole, RootId, RootKind, RootLocator, ScannedBook, SeriesFolder,
        SeriesNaming, Sourced, ValueSource, add_root, closest_title_words, folder_groups,
        person_series, record_scanned_books, writers,
    },
    store::{SeriesEdits, Store},
};
use omnileaf_sync_proto::{Fingerprint, ImageEntry};
use store_support::{FakeClock, NOW_UNIX_MS, open_store};
use support::ScratchFolder;

const MODIFIED_AT_MS: i64 = 1_780_000_000_000;
const SHOWN: &str = "Lantern Keepers/Sample Series 01";
const RATED: &str = "Hidden Imprint/Forbidden Tale";
const MARKED: &str = "Marked Imprint/Sample Series 03";
const SHARED_WRITER: &str = "Pat Writer";
const RATED_ONLY_WRITER: &str = "Sam Hidden";
const HIDING: AdultHiding = AdultHiding {
    leaves_out_adult: true,
    counts_age_ratings: true,
};
const HIDING_ONLY_MARKS: AdultHiding = AdultHiding {
    leaves_out_adult: true,
    counts_age_ratings: false,
};

struct Library {
    store: Store,
    _folder: ScratchFolder,
}

impl Library {
    async fn open(name: &str) -> Self {
        let folder = ScratchFolder::new(name);
        let store = open_store(&folder, FakeClock::at(NOW_UNIX_MS));
        let root = NewRoot {
            kind: RootKind::Linked,
            locator: RootLocator::Path(PathBuf::from("/media/Comics")),
            added_at_ms: MODIFIED_AT_MS,
        };
        let root = store
            .database()
            .write(move |transaction| add_root(transaction, &root))
            .await
            .unwrap();
        let scanned = vec![
            scanned_book(root, 1, SHOWN, None, &[SHARED_WRITER]),
            scanned_book(
                root,
                2,
                RATED,
                Some(AgeRating::AdultsOnly18),
                &[SHARED_WRITER, RATED_ONLY_WRITER],
            ),
            scanned_book(root, 3, MARKED, None, &[]),
        ];
        store
            .database()
            .write(move |transaction| record_scanned_books(transaction, &scanned))
            .await
            .unwrap();
        let marked = SeriesEdits {
            is_adult: true,
            ..SeriesEdits::default()
        };
        let series = series_of(MARKED).id();
        store
            .write(move |writer| writer.edit_series(series, marked))
            .await
            .unwrap();
        Self {
            store,
            _folder: folder,
        }
    }

    async fn group_counts(&self, hiding: AdultHiding) -> Vec<(String, u32)> {
        let request = request();
        self.store
            .database()
            .read(move |connection| folder_groups(connection, &request, hiding))
            .await
            .unwrap()
            .items
            .into_iter()
            .map(|summary| (group_name(&summary.group), summary.series_count))
            .collect()
    }

    async fn writer_counts(&self, hiding: AdultHiding) -> Vec<(String, u32)> {
        let request = request();
        self.store
            .database()
            .read(move |connection| writers(connection, &request, hiding))
            .await
            .unwrap()
            .items
            .into_iter()
            .map(|writer| (writer.name, writer.series_count))
            .collect()
    }

    async fn series_of_writer(&self, name: &str, hiding: AdultHiding) -> Vec<String> {
        let name = name.to_owned();
        self.store
            .database()
            .read(move |connection| person_series(connection, &name, hiding))
            .await
            .unwrap()
            .into_iter()
            .map(|series| series.title)
            .collect()
    }

    async fn suggested(&self, text: &str, hiding: AdultHiding) -> Option<String> {
        let text = text.to_owned();
        self.store
            .database()
            .read(move |connection| closest_title_words(connection, &text, hiding))
            .await
            .unwrap()
    }
}

fn request() -> PageRequest {
    PageRequest {
        after: None,
        size: PageSize::try_from(50).unwrap(),
    }
}

fn group_name(group: &FolderGroup) -> String {
    group.location.to_string_lossy().into_owned()
}

fn series_of(series_folder: &str) -> NewSeries {
    let location = Path::new(series_folder);
    NewSeries::folder(
        SeriesFolder {
            linked_folder: "Comics",
            location,
        },
        SeriesNaming {
            title: Sourced {
                value: series_folder.rsplit('/').next().unwrap().to_owned(),
                source: ValueSource::FolderName,
            },
            year: None,
        },
        0,
    )
    .unwrap()
}

fn scanned_book(
    root: RootId,
    crc: u32,
    series_folder: &str,
    age_rating: Option<AgeRating>,
    writers: &[&str],
) -> ScannedBook {
    let people = writers
        .iter()
        .map(|name| BookPerson {
            role: PersonRole::Writer,
            name: (*name).to_owned(),
        })
        .collect();
    ScannedBook {
        series: series_of(series_folder),
        named_series: None,
        fingerprint: Fingerprint::pmf1([ImageEntry {
            crc32: crc,
            size: 100,
        }])
        .unwrap(),
        title: format!("Volume {crc:02}"),
        added_at_ms: 0,
        page_count: 1,
        details: BookDetails {
            age_rating,
            people,
            ..BookDetails::default()
        },
        numbering: None,
        name_language: None,
        file: BookFile {
            root,
            location: Path::new(series_folder).join(format!("Volume {crc:02}.cbz")),
            size_bytes: 100,
            modified_at_ms: MODIFIED_AT_MS,
        },
    }
}

fn named(entries: &[(&str, u32)]) -> Vec<(String, u32)> {
    entries
        .iter()
        .map(|&(name, count)| (name.to_owned(), count))
        .collect()
}

#[tokio::test]
async fn leaves_18_plus_series_out_of_the_folder_groups_and_their_counts_while_hiding() {
    let library = Library::open("hiding-folder-groups").await;

    let groups = (
        library.group_counts(AdultHiding::default()).await,
        library.group_counts(HIDING).await,
        library.group_counts(HIDING_ONLY_MARKS).await,
    );

    assert_eq!(
        groups,
        (
            named(&[
                ("Hidden Imprint", 1),
                ("Lantern Keepers", 1),
                ("Marked Imprint", 1)
            ]),
            named(&[("Lantern Keepers", 1)]),
            named(&[("Hidden Imprint", 1), ("Lantern Keepers", 1)]),
        )
    );
}

#[tokio::test]
async fn leaves_18_plus_series_out_of_the_writers_and_their_counts_while_hiding() {
    let library = Library::open("hiding-writers").await;

    let writers = (
        library.writer_counts(AdultHiding::default()).await,
        library.writer_counts(HIDING).await,
    );

    assert_eq!(
        writers,
        (
            named(&[(SHARED_WRITER, 2), (RATED_ONLY_WRITER, 1)]),
            named(&[(SHARED_WRITER, 1)]),
        )
    );
}

#[tokio::test]
async fn lists_only_the_shown_series_naming_a_person_while_hiding() {
    let library = Library::open("hiding-person-series").await;

    let listed = (
        library
            .series_of_writer(SHARED_WRITER, AdultHiding::default())
            .await,
        library.series_of_writer(SHARED_WRITER, HIDING).await,
    );

    assert_eq!(
        listed,
        (
            vec!["Forbidden Tale".to_owned(), "Sample Series 01".to_owned()],
            vec!["Sample Series 01".to_owned()],
        )
    );
}

#[tokio::test]
async fn suggests_no_word_of_an_18_plus_title_while_hiding() {
    let library = Library::open("hiding-spelling").await;

    let suggested = (
        library.suggested("forbiden", AdultHiding::default()).await,
        library.suggested("forbiden", HIDING).await,
        library.suggested("forbiden", HIDING_ONLY_MARKS).await,
    );

    assert_eq!(
        suggested,
        (
            Some("forbidden".to_owned()),
            None,
            Some("forbidden".to_owned())
        )
    );
}
