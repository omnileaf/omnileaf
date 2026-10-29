use std::error::Error;

use omnileaf_engine::{
    CrashReportError, DropError, HomeFolderError, LibraryError, OpenBookError, OpenFileError,
    describe_error,
};
use serde::Serialize;

use crate::report_relay::RelayError;
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
    BookTypeUnsupported,
    FileTypeRead,
    #[expect(
        dead_code,
        reason = "the interface keeps its notice for this code until it stops showing it"
    )]
    BookmarksNotKept,
    #[expect(
        dead_code,
        reason = "the interface keeps its notice for this code until it stops showing it"
    )]
    LabelsNotKept,
    #[expect(
        dead_code,
        reason = "the interface keeps its notice for this code until it stops showing it"
    )]
    DetailsNotKept,
    ReportNotSaved,
    RelayUnreachable,
    RelayRateLimited,
    RelayBusy,
    ReplyAddressInvalid,
    ReportRefused,
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

    pub(crate) fn reply_address_invalid() -> Self {
        Self {
            code: IpcErrorCode::ReplyAddressInvalid,
            message: "the email address for a reply isn't valid",
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
            LibraryError::BookNotFound { .. } => {
                (IpcErrorCode::BookNotFound, "that book isn't in the library")
            }
            LibraryError::FileTypeRead { .. } | LibraryError::ReadTypeKept { .. } => (
                IpcErrorCode::FileTypeRead,
                "the library reads files of that type, so it keeps them",
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

impl From<HomeFolderError> for IpcError {
    fn from(error: HomeFolderError) -> Self {
        match error {
            HomeFolderError::Library(error) => error.into(),
            HomeFolderError::Unreadable { .. }
            | HomeFolderError::Malformed { .. }
            | HomeFolderError::Unsaved { .. }
            | HomeFolderError::Unstorable { .. }
            | HomeFolderError::LibraryMissing { .. }
            | HomeFolderError::NoLibraryThere { .. }
            | HomeFolderError::LibraryThere { .. }
            | HomeFolderError::OverlapsHome { .. }
            | HomeFolderError::Unmoved { .. }
            | HomeFolderError::Interrupted(_) => Self::internal(&error),
        }
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

impl From<DropError> for IpcError {
    fn from(error: DropError) -> Self {
        match error {
            DropError::NothingToUse => {
                tracing::warn!(error = %describe_error(&error), "a drop held nothing to use");
                Self {
                    code: IpcErrorCode::BookTypeUnsupported,
                    message: "nothing dropped is a comic file or a folder",
                }
            }
            DropError::Open(error) => error.into(),
            DropError::Library(error) => error.into(),
            DropError::Copy { .. } => Self::internal(&error),
        }
    }
}

impl From<OpenFileError> for IpcError {
    fn from(error: OpenFileError) -> Self {
        let (code, message) = match error {
            OpenFileError::Unreadable { .. } => (
                IpcErrorCode::BookUnreadable,
                "the file could not be read as a book",
            ),
            OpenFileError::UnsupportedType { .. } => (
                IpcErrorCode::BookTypeUnsupported,
                "the file is of a type this app can't read",
            ),
            OpenFileError::Library(error) => return error.into(),
        };
        tracing::warn!(error = %describe_error(&error), "opening a file refused");
        Self { code, message }
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
            OpenBookError::UnsupportedType { .. } => (
                IpcErrorCode::BookTypeUnsupported,
                "the book's file is of a type this app can't read",
            ),
            OpenBookError::Library(error) => return error.into(),
            OpenBookError::Lane(_) => return Self::internal(&error),
        };
        tracing::warn!(error = %describe_error(&error), "opening a book refused");
        Self { code, message }
    }
}

impl From<RelayError> for IpcError {
    fn from(error: RelayError) -> Self {
        let (code, message) = match error {
            RelayError::Unreachable(_) | RelayError::Failed { .. } => (
                IpcErrorCode::RelayUnreachable,
                "the report could not reach Omnileaf",
            ),
            RelayError::RateLimited => (
                IpcErrorCode::RelayRateLimited,
                "too many reports were sent from this network",
            ),
            RelayError::Busy | RelayError::TooHard { .. } | RelayError::OutOfTime => (
                IpcErrorCode::RelayBusy,
                "Omnileaf is taking no more reports for now",
            ),
            RelayError::ReplyAddressInvalid => return Self::reply_address_invalid(),
            RelayError::Refused { .. } => {
                (IpcErrorCode::ReportRefused, "Omnileaf refused the report")
            }
            RelayError::UnexpectedAnswer { .. }
            | RelayError::Solver(_)
            | RelayError::Address { .. }
            | RelayError::Tls(_)
            | RelayError::NotStarted
            | RelayError::CodeTooShort => return Self::internal(&error),
        };
        tracing::warn!(error = %describe_error(&error), "send a problem report");
        Self { code, message }
    }
}

#[cfg(test)]
mod tests {
    use std::{io, path::PathBuf};

    use omnileaf_engine::{BookId, FileType, FolderId, LaneStopped, SeriesId};
    use omnileaf_formats::{FormatError, UnsupportedArchive};

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
    fn tells_the_interface_a_chosen_home_folder_could_not_be_read() {
        let chosen = PathBuf::from("/media/Sample Library");
        let unreadable = LibraryError::FolderUnreadable {
            path: chosen.clone(),
            source: io::Error::from(io::ErrorKind::PermissionDenied),
        };

        let codes = [
            HomeFolderError::Library(unreadable),
            HomeFolderError::NoLibraryThere { path: chosen },
        ]
        .map(|error| IpcError::from(error).code);

        assert_eq!(
            codes,
            [IpcErrorCode::FolderUnreadable, IpcErrorCode::Internal]
        );
    }

    #[test]
    fn tells_the_interface_why_files_like_a_book_stay_in_the_library() {
        let id = BookId::try_from("0190a3e4-0000-8000-8000-000000000002".to_owned()).unwrap();

        let codes = [
            code_for(LibraryError::BookNotFound { id }),
            code_for(LibraryError::FileTypeRead { id }),
        ];

        assert_eq!(
            codes,
            [IpcErrorCode::BookNotFound, IpcErrorCode::FileTypeRead]
        );
    }

    #[test]
    fn tells_the_interface_a_file_type_it_reads_stays_in_the_library() {
        let file_type = FileType::try_from("cbz".to_owned()).unwrap();

        let code = code_for(LibraryError::ReadTypeKept { file_type });

        assert_eq!(code, IpcErrorCode::FileTypeRead);
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
        let rar = PathBuf::from("/media/Sample Library/Sample Series 01 v02.cbr");
        let unsupported = OpenBookError::UnsupportedType {
            id,
            file_type: FileType::of(&rar).unwrap(),
            source: FormatError::ArchiveNotSupportedYet {
                path: rar,
                archive: UnsupportedArchive::Rar,
            },
        };

        let codes = [
            OpenBookError::BookNotFound { id },
            unreadable,
            unsupported,
            OpenBookError::Library(LibraryError::SeriesNotFound { id: series }),
            OpenBookError::Lane(LaneStopped),
        ]
        .map(|error| IpcError::from(error).code);

        assert_eq!(
            codes,
            [
                IpcErrorCode::BookNotFound,
                IpcErrorCode::BookUnreadable,
                IpcErrorCode::BookTypeUnsupported,
                IpcErrorCode::SeriesNotFound,
                IpcErrorCode::Internal,
            ]
        );
    }

    #[test]
    fn tells_the_interface_why_a_report_was_not_sent() {
        let codes = [
            RelayError::Failed {
                status: reqwest::StatusCode::BAD_GATEWAY,
            },
            RelayError::RateLimited,
            RelayError::Busy,
            RelayError::TooHard { bits: 30 },
            RelayError::OutOfTime,
            RelayError::ReplyAddressInvalid,
            RelayError::Refused {
                code: omnileaf_relay_proto::ErrorCode::CodeTaken,
            },
            RelayError::UnexpectedAnswer {
                status: reqwest::StatusCode::OK,
            },
        ]
        .map(|error| IpcError::from(error).code);

        assert_eq!(
            codes,
            [
                IpcErrorCode::RelayUnreachable,
                IpcErrorCode::RelayRateLimited,
                IpcErrorCode::RelayBusy,
                IpcErrorCode::RelayBusy,
                IpcErrorCode::RelayBusy,
                IpcErrorCode::ReplyAddressInvalid,
                IpcErrorCode::ReportRefused,
                IpcErrorCode::Internal,
            ]
        );
    }
}
