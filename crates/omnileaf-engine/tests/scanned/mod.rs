#![expect(
    clippy::unwrap_used,
    reason = "each test scans its own folder in a scratch library, so a failed set-up should stop the test"
)]

use std::path::Path;

use omnileaf_db::{
    catalog::{PageRequest, PageSize, SeriesOrder, SeriesSummary, series_books, series_page},
    rusqlite::{Connection, OpenFlags},
};
use omnileaf_engine::{Clock, FolderId, FolderScan, Library, ScanProgress};

use crate::support::TempFolder;

const NOW_UNIX_MS: u64 = 1_790_000_000_000;
const DATABASE_FILE: &str = "library.sqlite";

pub(crate) struct FixedClock;

impl Clock for FixedClock {
    fn now_unix_ms(&self) -> u64 {
        NOW_UNIX_MS
    }
}

/// A scratch library holding one linked folder, read through a connection of its own.
pub(crate) struct Scanned {
    pub(crate) library: Library,
    pub(crate) home: TempFolder,
    pub(crate) id: FolderId,
}

impl Scanned {
    pub(crate) async fn folder(name: &str, folder: &Path) -> (Self, FolderScan, Vec<ScanProgress>) {
        let home = TempFolder::new(&format!("{name}-home"));
        let library = Library::open(home.path().to_path_buf(), FixedClock)
            .await
            .unwrap();
        let mut progress = Vec::new();
        let scan = library
            .add_folder(folder.to_path_buf(), |step| progress.push(step))
            .await
            .unwrap();
        let page = library.folders(None).await.unwrap();
        let id = page.folders.last().unwrap().id;
        (Self { library, home, id }, scan, progress)
    }

    /// Each listed series' title and book count, in title order.
    pub(crate) fn series(&self) -> Vec<(String, u32)> {
        self.series_summaries()
            .into_iter()
            .map(|series| (series.title, series.book_count))
            .collect()
    }

    pub(crate) fn books_in(&self, title: &str) -> Vec<String> {
        let series = self
            .series_summaries()
            .into_iter()
            .find(|series| series.title == title)
            .unwrap();
        series_books(&self.connection(), series.id, &whole_page())
            .unwrap()
            .items
            .into_iter()
            .map(|book| book.title)
            .collect()
    }

    pub(crate) fn connection(&self) -> Connection {
        Connection::open_with_flags(
            self.home.path().join(DATABASE_FILE),
            OpenFlags::SQLITE_OPEN_READ_ONLY,
        )
        .unwrap()
    }

    fn series_summaries(&self) -> Vec<SeriesSummary> {
        series_page(&self.connection(), SeriesOrder::Title, &whole_page())
            .unwrap()
            .items
    }
}

pub(crate) fn whole_page() -> PageRequest {
    PageRequest {
        after: None,
        size: PageSize::try_from(PageSize::MAX).unwrap(),
    }
}

pub(crate) fn owned(rows: &[(&str, u32)]) -> Vec<(String, u32)> {
    rows.iter()
        .map(|(title, books)| ((*title).to_owned(), *books))
        .collect()
}
