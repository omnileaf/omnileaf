//! The headless core that the app's commands drive.

mod app_info;
mod clock;
mod folder_survey;
mod library;
mod library_folder;
mod project_link;
mod version_details;

pub use app_info::{AppInfo, Platform};
pub use clock::SystemClock;
pub use folder_survey::{FolderSurvey, SurveyError, survey_folder};
pub use library::{Library, LibraryError};
pub use library_folder::{FolderCursor, FolderId, FolderKind, FolderPage, LibraryFolder};
pub use omnileaf_db::store::Clock;
pub use project_link::ProjectLink;
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
