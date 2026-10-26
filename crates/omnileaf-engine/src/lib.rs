mod adult_content;
mod app_info;
mod app_language;
mod background_lane;
mod bookmark_access;
mod books_removal;
#[cfg(test)]
mod captured_log;
mod clock;
mod cover_path;
mod cover_thumbnails;
mod crash_report;
mod decode_permits;
mod device_class;
mod error_chain;
mod external_storage;
mod file_in_storage;
mod file_type;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod folder_watch;
mod found_library;
mod history;
mod home_folder_setting;
mod ipc_brand;
mod lane;
mod library;
mod library_book;
mod library_category;
mod library_changes;
mod library_folder;
mod library_labels;
mod library_layout;
mod library_listing;
mod library_search;
mod library_series;
mod library_tabs;
mod library_view;
mod linux_share;
mod log_stand_ins;
mod macos_share;
mod missing_folder;
mod moved_home;
mod network_share;
mod open_books;
mod opened_book;
mod page_lane;
mod page_path;
mod page_sizes;
mod page_thumbnail_path;
mod pages;
mod problem_report;
mod project_link;
mod reading_progress;
mod reading_session;
mod recent_log;
mod report_code;
mod rescan;
mod rescan_conditions;
mod rescan_plan;
mod rescan_schedule;
mod resource;
mod resource_router;
mod saved_report;
mod scan;
mod series_details;
mod series_overview;
mod storage_use;
mod utc_offset;
mod version_details;
mod windows_share;

pub use adult_content::{AdultContent, AdultTreatment};
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
pub use file_type::FileType;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub use folder_watch::{AppFiles, FolderWatch, FolderWatchSwitch};
pub use found_library::{FoundLibrary, found_library_in};
pub use history::{
    BookSessions, HistoryCursor, HistoryEntry, HistoryMark, HistoryOf, HistoryPage, HistorySeries,
    LocalDay, ReadTo, ReadingDay, ReadingSummary, ReadingWeek,
};
pub use home_folder_setting::{HomeChoice, HomeFolderError, HomeFolderSetting};
pub use lane::LaneStopped;
pub use library::{Library, LibraryError, LibraryFolders, OpenTree};
pub use library_book::{
    BookCursor, BookId, BookReading, BooksShown, ReadMark, SeriesBook, SeriesBookListing,
    SeriesBookPage,
};
pub use library_category::{CategoryId, LibraryCategory};
pub use library_changes::{LIBRARY_CHANGES_GATHERED_FOR, LibraryChanged, LibraryChanges};
pub use library_folder::{FolderCursor, FolderId, FolderKind, FolderPage, LibraryFolder};
pub use library_labels::{CategoryHeld, LabelChanges, LibraryTag, SeriesLabels, TagHeld};
pub use library_listing::{
    Inclusion, LibraryFilter, LibraryFilterChoices, LibraryListing, LibrarySort, LibrarySortBy,
    SeriesFormat, SmartFilter, SortDirection,
};
pub use library_search::{LibrarySearch, SpellingSuggestion};
pub use library_series::{LibrarySeries, SeriesCursor, SeriesId, SeriesPage};
pub use library_tabs::{LibraryTab, LibraryTabId};
pub use library_view::{
    CoversPerRow, CoversPerRowCount, CoversPerRowOutOfRange, CoversPerRowRange, CoversPerRowRanges,
    DesktopCoversPerRow, LibraryDisplay, LibraryGrouping, LibraryView, OnCovers, PhoneCoversPerRow,
    TabletCoversPerRow,
};
pub use linux_share::{MountTables, unreachable_linux_share};
pub use log_stand_ins::{CleanedLog, LogStandIns};
pub use missing_folder::{FolderProblem, MissingFolder};
pub use network_share::{NetworkShare, ShareAddress, ShareLookup, ShareSignIn, UnreachableShare};
pub use omnileaf_db::catalog::{AndroidTree, AppleBookmark, RootLocator, TreeUri};
pub use omnileaf_db::store::{Changed, Clock};
pub use opened_book::{
    BookDamage, BookPage, BookPlace, DamageCause, OpenedBook, PageDimensions, ProbedFormat,
    ReadingDirection, SeriesNeighbour,
};
pub use page_path::{MalformedPagePath, PageCrop, PagePath};
pub use page_thumbnail_path::{MalformedPageThumbnailPath, PageThumbnailPath};
pub use pages::OpenBookError;
pub use problem_report::{ProblemReport, ProblemReportPreview};
pub use project_link::ProjectLink;
pub use reading_progress::ReadingSaved;
pub use reading_session::READING_SAVE_DELAY;
pub use recent_log::RecentLog;
pub use report_code::{NotAReportCode, ReportCode};
pub use rescan::{FileChanges, FolderRescan, RescanOutcome};
pub use rescan_conditions::{
    EXTERNAL_RESCAN_EVERY, PowerMode, RESCAN_EVERY, RescanConditions, Storage,
};
pub use resource::Resource;
pub use resource_router::{ResourceRouter, ResourceRouterError};
pub use saved_report::{SavedPlace, SavedProblemReport, folder_shown};
pub use scan::{FolderScan, ScanProgress};
pub use series_details::{
    DetailEdits, EditedPeople, EditedSummary, EditedTags, EditedTitle, SeriesDetails, SeriesPerson,
};
pub use series_overview::{
    CreatorRole, CreatorSeries, RelatedReason, RelatedSeries, SeriesCreator, SeriesOverview,
};
pub use storage_use::{CacheSizes, LOW_SPACE_BYTES, StorageUse, VolumeSpace, database_bytes};
pub use utc_offset::{UtcOffset, UtcOffsetOutOfRange};
pub use version_details::{BuildProfile, VersionDetails};
pub use windows_share::unreachable_windows_share;

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
