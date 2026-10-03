//! The headless core that the app's commands drive.

mod app_info;
mod crash_report;
mod folder_survey;
mod project_link;
mod version_details;

pub use app_info::{AppInfo, Platform};
pub use crash_report::{
    CrashReport, CrashReportError, CrashReportFile, CrashReportId, CrashReportOffers, CrashedApp,
    InterfaceError, PanicDetails, SourceLocation, UnsavedCrashReport,
};
pub use folder_survey::{FolderSurvey, SurveyError, survey_folder};
pub use project_link::ProjectLink;
use version_details::platform_name;
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
