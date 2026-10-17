use std::error::Error;

use omnileaf_engine::{CrashReportError, LibraryError, OpenBookError, describe_error};
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
    FolderAlreadyInLibrary,
    HomeFolderKept,
    ClipboardUnavailable,
    BrowserUnavailable,
    FileManagerUnavailable,
    SystemSettingsUnavailable,
    NoCrashReport,
    CrashReportUnavailable,
    #[cfg_attr(
        not(debug_assertions),
        expect(dead_code, reason = "only development builds offer crash tests")
    )]
    DevelopmentBuildOnly,
    SeriesNotFound,
    SearchTooLong,
    CursorForAnotherList,
    BookNotFound,
    BookUnreadable,
    BookmarksNotKept,
    LabelsNotKept,
    DetailsNotKept,
    ReportNotSaved,
    ReportsNotSent,
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

    pub(crate) fn file_manager_unavailable(error: &dyn Error) -> Self {
        tracing::warn!(error = %describe_error(error), "show a series' file in its folder");
        Self {
            code: IpcErrorCode::FileManagerUnavailable,
            message: "the file manager could not be opened",
        }
    }

    pub(crate) fn report_not_saved(error: &dyn Error) -> Self {
        tracing::warn!(error = %describe_error(error), "save a problem report");
        Self {
            code: IpcErrorCode::ReportNotSaved,
            message: "the problem report could not be saved",
        }
    }

    pub(crate) fn system_settings_unavailable(error: &dyn Error) -> Self {
        tracing::warn!(error = %describe_error(error), "open the system's settings");
        Self {
            code: IpcErrorCode::SystemSettingsUnavailable,
            message: "the system's settings could not be opened",
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

    pub(crate) fn bookmarks_not_kept() -> Self {
        Self {
            code: IpcErrorCode::BookmarksNotKept,
            message: "the library keeps no bookmarks yet",
        }
    }

    pub(crate) fn labels_not_kept() -> Self {
        Self {
            code: IpcErrorCode::LabelsNotKept,
            message: "the library keeps no categories or tags yet",
        }
    }

    pub(crate) fn details_not_kept() -> Self {
        Self {
            code: IpcErrorCode::DetailsNotKept,
            message: "the library keeps no edits to series details yet",
        }
    }

    pub(crate) fn reports_not_sent() -> Self {
        Self {
            code: IpcErrorCode::ReportsNotSent,
            message: "problem reports have nowhere to be sent yet",
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
            LibraryError::FolderAlreadyInLibrary { .. } => (
                IpcErrorCode::FolderAlreadyInLibrary,
                "the library already reads that folder",
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
            LibraryError::CursorForAnotherList => (
                IpcErrorCode::CursorForAnotherList,
                "that page cursor belongs to another list",
            ),
            LibraryError::CreateFolder { .. }
            | LibraryError::Database(_)
            | LibraryError::StoredView(_)
            | LibraryError::Interrupted(_)
            | LibraryError::ReadingStopped => return Self::internal(&error),
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

impl From<OpenBookError> for IpcError {
    fn from(error: OpenBookError) -> Self {
        let (code, message) = match error {
            OpenBookError::BookNotFound { .. } => {
                (IpcErrorCode::BookNotFound, "that book isn't in the library")
            }
            OpenBookError::Unreadable { .. } | OpenBookError::FolderClosed { .. } => (
                IpcErrorCode::BookUnreadable,
                "the book's file could not be read",
            ),
            OpenBookError::Library(error) => return error.into(),
            OpenBookError::Lane(_) => return Self::internal(&error),
        };
        tracing::warn!(error = %describe_error(&error), "opening a book refused");
        Self { code, message }
    }
}

#[cfg(test)]
mod tests {
    use std::{io, path::PathBuf};

    use omnileaf_engine::{BookId, FolderId, LaneStopped, SeriesId};
    use omnileaf_formats::FormatError;

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
            code_for(LibraryError::from(omnileaf_db::Error::CursorForAnotherList)),
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
                IpcErrorCode::CursorForAnotherList,
                IpcErrorCode::Internal,
            ]
        );
    }

    #[test]
    fn tells_the_interface_the_library_keeps_no_bookmarks_yet() {
        assert_eq!(
            IpcError::bookmarks_not_kept().code,
            IpcErrorCode::BookmarksNotKept
        );
    }

    #[test]
    fn tells_the_interface_the_library_keeps_no_edits_to_details_yet() {
        assert_eq!(
            IpcError::details_not_kept().code,
            IpcErrorCode::DetailsNotKept
        );
    }

    #[test]
    fn tells_the_interface_the_library_keeps_no_categories_or_tags_yet() {
        assert_eq!(
            IpcError::labels_not_kept().code,
            IpcErrorCode::LabelsNotKept
        );
    }

    #[test]
    fn tells_the_interface_problem_reports_have_nowhere_to_be_sent_yet() {
        assert_eq!(
            IpcError::reports_not_sent().code,
            IpcErrorCode::ReportsNotSent
        );
    }

    #[test]
    fn tells_the_interface_why_a_book_did_not_open() {
        let id = BookId::try_from("0190a3e4-0000-8000-8000-000000000002".to_owned()).unwrap();
        let series = SeriesId::try_from("0190a3e4-0000-8000-8000-000000000001".to_owned()).unwrap();
        let unreadable = OpenBookError::Unreadable {
            id,
            source: FormatError::Unsupported {
                path: PathBuf::from("/media/Sample Library/Sample Series 01 v01.cbz"),
            },
        };

        let codes = [
            OpenBookError::BookNotFound { id },
            unreadable,
            OpenBookError::Library(LibraryError::SeriesNotFound { id: series }),
            OpenBookError::Lane(LaneStopped),
        ]
        .map(|error| IpcError::from(error).code);

        assert_eq!(
            codes,
            [
                IpcErrorCode::BookNotFound,
                IpcErrorCode::BookUnreadable,
                IpcErrorCode::SeriesNotFound,
                IpcErrorCode::Internal,
            ]
        );
    }
}
