mod app_info;
mod app_language;
mod background_lane;
mod bookmark_access;
mod books_removal;
mod clock;
mod cover_path;
mod cover_thumbnails;
mod crash_report;
mod device_class;
mod error_chain;
mod external_storage;
mod file_in_storage;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod folder_watch;
mod ipc_brand;
mod lane;
mod library;
mod library_book;
mod library_changes;
mod library_folder;
mod library_layout;
mod library_listing;
mod library_search;
mod library_series;
mod library_view;
mod moved_home;
mod open_books;
mod opened_book;
mod page_lane;
mod page_path;
mod pages;
mod project_link;
mod rescan;
mod rescan_conditions;
mod rescan_plan;
mod rescan_schedule;
mod resource;
mod resource_router;
mod scan;
mod series_overview;
mod version_details;

pub use app_info::{AppInfo, Platform};
pub use app_language::AppLanguage;
pub use bookmark_access::ResolvedBookmark;
pub use books_removal::BooksRemoval;
pub use clock::SystemClock;
pub use cover_path::{CoverPath, MalformedCoverPath};
pub use crash_report::{
    CrashOrigin, CrashReport, CrashReportError, CrashReportFile, CrashReportId, CrashReportOffers,
    CrashedApp, InterfaceError, PanicDetails, SourceLocation, UnsavedCrashReport, contain_panic,
    is_panic_contained,
};
pub use error_chain::describe_error;
pub use external_storage::{storage_by_device, storage_in_mountinfo, storage_of_windows_path};
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub use folder_watch::{AppFiles, FolderWatch, FolderWatchSwitch};
pub use lane::LaneStopped;
pub use library::{Library, LibraryError, LibraryFolders, OpenTree};
pub use library_book::{
    BookCursor, BookId, BookReading, BooksShown, ReadMark, SeriesBook, SeriesBookListing,
    SeriesBookPage,
};
pub use library_changes::{LIBRARY_CHANGES_GATHERED_FOR, LibraryChanged, LibraryChanges};
pub use library_folder::{FolderCursor, FolderId, FolderKind, FolderPage, LibraryFolder};
pub use library_listing::{
    Inclusion, LibraryFilter, LibraryListing, LibrarySort, LibrarySortBy, SortDirection,
};
pub use library_search::LibrarySearch;
pub use library_series::{LibrarySeries, SeriesCursor, SeriesId, SeriesPage};
pub use library_view::{
    CoversPerRow, CoversPerRowCount, CoversPerRowOutOfRange, CoversPerRowRange, CoversPerRowRanges,
    DesktopCoversPerRow, LibraryDisplay, LibraryView, OnCovers, PhoneCoversPerRow,
    TabletCoversPerRow,
};
pub use omnileaf_db::catalog::{AndroidTree, AppleBookmark, RootLocator, TreeUri};
pub use omnileaf_db::store::{Changed, Clock};
pub use opened_book::{BookPage, OpenedBook, PageDimensions, ProbedFormat, SeriesNeighbour};
pub use page_path::{MalformedPagePath, PagePath};
pub use pages::OpenBookError;
pub use project_link::ProjectLink;
pub use rescan::{FileChanges, FolderRescan, RescanOutcome};
pub use rescan_conditions::{
    EXTERNAL_RESCAN_EVERY, PowerMode, RESCAN_EVERY, RescanConditions, Storage,
};
pub use resource::Resource;
pub use resource_router::{ResourceRouter, ResourceRouterError};
pub use scan::{FolderScan, ScanProgress};
pub use series_overview::SeriesOverview;
pub use version_details::{BuildProfile, VersionDetails};

#[derive(Debug)]
pub struct Core {
    app_info: AppInfo,
}

impl Core {
    #[must_use]
    pub fn new() -> Self {
        Self {
            app_info: AppInfo {
                version: env!("CARGO_PKG_VERSION").to_owned(),
                platform: Platform::CURRENT,
                source_code: ProjectLink::SourceCode.address().to_owned(),
                is_development_build: BuildProfile::CURRENT == BuildProfile::Debug,
            },
        }
    }

    #[must_use]
    pub fn app_info(&self) -> &AppInfo {
        &self.app_info
    }
}

impl Default for Core {
    fn default() -> Self {
        Self::new()
    }
}
