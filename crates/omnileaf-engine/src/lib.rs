//! The headless core that the app's commands drive.

mod app_info;
mod app_language;
mod background_lane;
mod bookmark_access;
mod clock;
mod cover_path;
mod cover_thumbnails;
mod crash_report;
mod device_class;
mod error_chain;
mod ipc_brand;
mod library;
mod library_changes;
mod library_folder;
mod library_layout;
mod library_series;
mod library_view;
mod project_link;
mod rescan;
mod rescan_plan;
mod rescan_schedule;
mod resource;
mod resource_router;
mod scan;
mod version_details;

pub use app_info::{AppInfo, Platform};
pub use app_language::AppLanguage;
pub use bookmark_access::ResolvedBookmark;
pub use clock::SystemClock;
pub use cover_path::{CoverPath, MalformedCoverPath};
pub use crash_report::{
    CrashOrigin, CrashReport, CrashReportError, CrashReportFile, CrashReportId, CrashReportOffers,
    CrashedApp, InterfaceError, PanicDetails, SourceLocation, UnsavedCrashReport, contain_panic,
    is_panic_contained,
};
pub use error_chain::describe_error;
pub use library::{Library, LibraryError};
pub use library_changes::{LIBRARY_CHANGES_GATHERED_FOR, LibraryChanged, LibraryChanges};
pub use library_folder::{FolderCursor, FolderId, FolderKind, FolderPage, LibraryFolder};
pub use library_series::{LibrarySeries, SeriesCursor, SeriesId, SeriesPage};
pub use library_view::{
    CoversPerRow, CoversPerRowCount, CoversPerRowOutOfRange, CoversPerRowRange, CoversPerRowRanges,
    DesktopCoversPerRow, LibraryDisplay, LibraryView, OnCovers, PhoneCoversPerRow,
    TabletCoversPerRow,
};
pub use omnileaf_db::catalog::{AppleBookmark, RootLocator};
pub use omnileaf_db::store::{Changed, Clock};
pub use project_link::ProjectLink;
pub use rescan::{FileChanges, FolderRescan, RescanOutcome};
pub use rescan_schedule::RESCAN_EVERY;
pub use resource::Resource;
pub use resource_router::{ResourceRouter, ResourceRouterError};
pub use scan::{FolderScan, ScanProgress};
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
