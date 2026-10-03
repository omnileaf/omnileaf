//! The headless core that the app's commands drive.

mod app_info;
mod app_language;
mod background_lane;
mod clock;
mod cover_path;
mod cover_thumbnails;
mod error_chain;
mod library;
mod library_changes;
mod library_folder;
mod library_layout;
mod library_series;
mod rescan;
mod rescan_plan;
mod resource;
mod resource_router;
mod scan;

pub use app_info::{AppInfo, Platform};
pub use app_language::AppLanguage;
pub use clock::SystemClock;
pub use cover_path::{CoverPath, MalformedCoverPath};
pub use error_chain::describe_error;
pub use library::{Library, LibraryError};
pub use library_changes::{LIBRARY_CHANGES_GATHERED_FOR, LibraryChanged, LibraryChanges};
pub use library_folder::{FolderCursor, FolderId, FolderKind, FolderPage, LibraryFolder};
pub use library_series::{LibrarySeries, SeriesCursor, SeriesId, SeriesPage};
pub use omnileaf_db::store::{Changed, Clock};
pub use rescan::{FileChanges, FolderRescan, RescanOutcome};
pub use resource::Resource;
pub use resource_router::{ResourceRouter, ResourceRouterError};
pub use scan::{FolderScan, ScanProgress};

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
