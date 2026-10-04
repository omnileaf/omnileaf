use std::error::Error;

use omnileaf_engine::{CrashReportError, LibraryError, describe_error};
use serde::Serialize;
use specta::Type;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub(crate) enum IpcErrorCode {
    #[expect(
        dead_code,
        reason = "the interface keeps its notice for this code until it stops showing it"
    )]
    FolderPickerUnavailable,
    #[cfg_attr(
        not(any(target_os = "linux", test)),
        expect(dead_code, reason = "only Linux desktops can lack a folder chooser")
    )]
    FolderChooserMissing,
    FolderUnreadable,
    FolderNotFound,
    HomeFolderKept,
    ClipboardUnavailable,
    BrowserUnavailable,
    NoCrashReport,
    CrashReportUnavailable,
    #[cfg_attr(
        not(debug_assertions),
        expect(dead_code, reason = "only development builds offer crash tests")
    )]
    DevelopmentBuildOnly,
    SeriesNotFound,
    SearchTooLong,
    Internal,
}

#[derive(Debug, PartialEq, Eq, Serialize, Type)]
pub(crate) struct IpcError {
    code: IpcErrorCode,
    message: &'static str,
}

impl IpcError {
    #[cfg(any(target_os = "linux", test))]
    pub(crate) fn folder_chooser_missing() -> Self {
        Self {
            code: IpcErrorCode::FolderChooserMissing,
            message: "no desktop portal or zenity can show a folder chooser",
        }
    }

    pub(crate) fn clipboard_unavailable(error: &dyn Error) -> Self {
        tracing::warn!(error = %describe_error(error), "copy the version details");
        Self {
            code: IpcErrorCode::ClipboardUnavailable,
            message: "the clipboard could not be written",
        }
    }

    pub(crate) fn browser_unavailable(error: &dyn Error) -> Self {
        tracing::warn!(error = %describe_error(error), "open a project page in the browser");
        Self {
            code: IpcErrorCode::BrowserUnavailable,
            message: "the browser could not be opened",
        }
    }

    pub(crate) fn no_crash_report() -> Self {
        Self {
            code: IpcErrorCode::NoCrashReport,
            message: "no crash report is waiting for a decision",
        }
    }

    #[cfg(debug_assertions)]
    pub(crate) fn development_build_only() -> Self {
        Self {
            code: IpcErrorCode::DevelopmentBuildOnly,
            message: "only development builds can crash on purpose",
        }
    }

    pub(crate) fn internal(error: &dyn Error) -> Self {
        tracing::error!(error = %describe_error(error), "command failed");
        Self {
            code: IpcErrorCode::Internal,
            message: "something went wrong inside the app",
        }
    }
}

impl From<LibraryError> for IpcError {
    fn from(error: LibraryError) -> Self {
        let (code, message) = match error {
            LibraryError::FolderUnreadable { .. } => (
                IpcErrorCode::FolderUnreadable,
                "the folder could not be read",
            ),
            LibraryError::FolderNotFound { .. } => (
                IpcErrorCode::FolderNotFound,
                "that folder isn't in the library",
            ),
            LibraryError::HomeFolderKept { .. } => (
                IpcErrorCode::HomeFolderKept,
                "the home folder stays in the library",
            ),
            LibraryError::SeriesNotFound { .. } => (
                IpcErrorCode::SeriesNotFound,
                "that series isn't in the library",
            ),
            LibraryError::SearchTooLong { .. } => (
                IpcErrorCode::SearchTooLong,
                "the search is longer than a search reads",
            ),
            LibraryError::CreateFolder { .. }
            | LibraryError::Database(_)
            | LibraryError::StoredView(_)
            | LibraryError::Interrupted(_) => return Self::internal(&error),
        };
        tracing::warn!(error = %describe_error(&error), "library command refused");
        Self { code, message }
    }
}

impl From<CrashReportError> for IpcError {
    fn from(error: CrashReportError) -> Self {
        tracing::warn!(error = %describe_error(&error), "handle a crash report");
        Self {
            code: IpcErrorCode::CrashReportUnavailable,
            message: "the crash report could not be read or removed",
        }
    }
}

#[cfg(test)]
mod tests {
    use std::{io, path::PathBuf};

    use omnileaf_engine::{FolderId, SeriesId};

    use super::*;

    fn code_for(error: LibraryError) -> IpcErrorCode {
        IpcError::from(error).code
    }

    #[test]
    fn tells_the_interface_which_library_failure_it_met() {
        let unreadable = LibraryError::FolderUnreadable {
            path: PathBuf::from("/media/Sample Library"),
            source: io::Error::from(io::ErrorKind::PermissionDenied),
        };
        let id: FolderId = "7".parse().unwrap();

        let codes = [
            code_for(unreadable),
            code_for(LibraryError::FolderNotFound { id }),
            code_for(LibraryError::HomeFolderKept { id }),
            code_for(LibraryError::SeriesNotFound {
                id: SeriesId::try_from("0190a3e4-0000-8000-8000-000000000001".to_owned()).unwrap(),
            }),
            code_for(LibraryError::SearchTooLong {
                chars: 201,
                max: 200,
            }),
            code_for(LibraryError::CreateFolder {
                path: PathBuf::from("/data/Omnileaf"),
                source: io::Error::from(io::ErrorKind::StorageFull),
            }),
        ];

        assert_eq!(
            codes,
            [
                IpcErrorCode::FolderUnreadable,
                IpcErrorCode::FolderNotFound,
                IpcErrorCode::HomeFolderKept,
                IpcErrorCode::SeriesNotFound,
                IpcErrorCode::SearchTooLong,
                IpcErrorCode::Internal,
            ]
        );
    }
}
