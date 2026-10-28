#![expect(
    clippy::unwrap_used,
    reason = "each test builds its own scratch library, so a failed set-up should stop the test"
)]

mod support;

use std::path::{Path, PathBuf};

use omnileaf_db::{
    Database,
    adult_content::AdultHiding,
    catalog::{
        BookDetails, BookFile, Cursor, FolderGroup, FolderGroupSummary, NewRoot, NewSeries,
        PageRequest, PageSize, RootId, RootKind, RootLocator, ScannedBook, SeriesFilter,
        SeriesFolder, SeriesListing, SeriesNaming, SeriesOrder, SeriesSort, Sourced, ValueSource,
        add_root, folder_group_series_count, folder_group_series_page, folder_groups,
        record_scanned_books,
    },
};
use omnileaf_sync_proto::{Fingerprint, ImageEntry};
use support::{ScratchFolder, library_config};

const MODIFIED_AT_MS: i64 = 1_780_000_000_000;
const A_TO_Z: SeriesListing = SeriesListing::unfiltered(SeriesSort::ascending(SeriesOrder::Title));
const SERIES_FOLDERS: [&str; 7] = [
    "Author B Two/Sample Series 07",
    "Author B/Sample Series 02",
    "Author B/Imprint/Sample Series 06",
    "Sample Series 04",
    "author a/Sample Series 01",
    "Author B/Sample Series 03",
    "Sample Series 05.cbz",
];

struct Library {
    database: Database,
    root: RootId,
    _folder: ScratchFolder,
}

impl Library {
    async fn with_series_in(name: &str, series_folders: &[&str]) -> Self {
        let folder = ScratchFolder::new(name);
        let database = Database::open(&library_config(&folder)).unwrap();
        let root = NewRoot {
            kind: RootKind::Linked,
            locator: RootLocator::Path(PathBuf::from("/media/Comics")),
            added_at_ms: MODIFIED_AT_MS,
        };
        let root = database
            .write(move |transaction| add_root(transaction, &root))
            .await
            .unwrap();
        let scanned: Vec<ScannedBook> = (1..)
            .zip(series_folders)
            .map(|(crc, series_folder)| scanned_book(root, crc, series_folder))
            .collect();
        database
            .write(move |transaction| record_scanned_books(transaction, &scanned))
            .await
            .unwrap();
        Self {
            database,
            root,
            _folder: folder,
        }
    }

    async fn page(
        &self,
        after: Option<Cursor>,
        size: u16,
    ) -> (Vec<FolderGroupSummary>, Option<Cursor>) {
        let request = PageRequest {
            after: after.map(|cursor| cursor.to_string().parse().unwrap()),
            size: PageSize::try_from(size).unwrap(),
        };
        let page = self
            .database
            .read(move |connection| folder_groups(connection, &request, AdultHiding::default()))
            .await
            .unwrap();
        (page.items, page.next)
    }

    async fn series_in(&self, location: &str) -> (Vec<String>, u32) {
        let group = FolderGroup {
            root: self.root,
            location: PathBuf::from(location),
        };
        let request = PageRequest {
            after: None,
            size: PageSize::try_from(10).unwrap(),
        };
        self.database
            .read(move |connection| {
                let page = folder_group_series_page(connection, &group, &A_TO_Z, &request)?;
                let count = folder_group_series_count(connection, &group, &SeriesFilter::NONE)?;
                let titles = page.items.into_iter().map(|series| series.title).collect();
                Ok((titles, count))
            })
            .await
            .unwrap()
    }

    fn group(&self, location: &str, series_count: u32) -> FolderGroupSummary {
        FolderGroupSummary {
            group: FolderGroup {
                root: self.root,
                location: PathBuf::from(location),
            },
            series_count,
        }
    }
}

fn scanned_book(root: RootId, crc: u32, series_folder: &str) -> ScannedBook {
    let location = Path::new(series_folder);
    let is_one_shot = location.extension().is_some();
    ScannedBook {
        series: NewSeries::folder(
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
        .unwrap(),
        named_series: None,
        fingerprint: Fingerprint::pmf1([ImageEntry {
            crc32: crc,
            size: 100,
        }])
        .unwrap(),
        title: format!("Volume {crc:02}"),
        added_at_ms: 0,
        page_count: 1,
        details: BookDetails::default(),
        numbering: None,
        name_language: None,
        file: BookFile {
            root,
            location: if is_one_shot {
                location.to_path_buf()
            } else {
                location.join(format!("Volume {crc:02}.cbz"))
            },
            size_bytes: 100,
            modified_at_ms: MODIFIED_AT_MS,
        },
    }
}

#[tokio::test]
async fn lists_the_linked_folder_s_own_group_first_then_each_folder_in_title_order_before_those_inside_it()
 {
    let library = Library::with_series_in("folder-groups-in-order", &SERIES_FOLDERS).await;

    let (listed, next) = library.page(None, 10).await;

    assert_eq!(
        (listed, next),
        (
            vec![
                library.group("", 2),
                library.group("author a", 1),
                library.group("Author B", 2),
                library.group("Author B/Imprint", 1),
                library.group("Author B Two", 1),
            ],
            None
        )
    );
}

#[tokio::test]
async fn pages_through_the_folder_groups_with_a_cursor() {
    let library = Library::with_series_in("folder-groups-paged", &SERIES_FOLDERS).await;
    let (every_group, _) = library.page(None, 10).await;

    let mut paged = Vec::new();
    let mut after = None;
    loop {
        let (groups, next) = library.page(after, 1).await;
        paged.extend(groups);
        match next {
            Some(next) => after = Some(next),
            None => break,
        }
    }

    assert_eq!(paged, every_group);
}

#[tokio::test]
async fn lists_and_counts_the_series_in_a_folder_group_and_in_the_linked_folder_s_own() {
    let library = Library::with_series_in("folder-group-series", &SERIES_FOLDERS).await;

    let in_author_b = library.series_in("Author B").await;
    let in_own_group = library.series_in("").await;
    let in_unknown_group = library.series_in("Author C").await;

    assert_eq!(
        (in_author_b, in_own_group, in_unknown_group),
        (
            (
                vec!["Sample Series 02".to_owned(), "Sample Series 03".to_owned()],
                2
            ),
            (
                vec![
                    "Sample Series 04".to_owned(),
                    "Sample Series 05.cbz".to_owned()
                ],
                2
            ),
            (Vec::new(), 0),
        )
    );
}

#[test]
fn reads_back_each_folder_group_from_the_id_it_gives_out() {
    let group = FolderGroup {
        root: "7".parse().unwrap(),
        location: PathBuf::from("Publisher/Author B"),
    };

    let read_back: FolderGroup = group.to_string().parse().unwrap();

    assert_eq!(read_back, group);
}
