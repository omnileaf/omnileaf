//! The error every fallible command returns: a stable code for the interface and a safe message.

use std::error::Error;

use omnileaf_engine::LibraryError;
use serde::Serialize;
use specta::Type;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub(crate) enum IpcErrorCode {
    #[cfg_attr(
        desktop,
        expect(dead_code, reason = "only mobile builds lack a folder picker for now")
    )]
    FolderPickerUnavailable,
    FolderUnreadable,
    FolderNotFound,
    HomeFolderKept,
    ClipboardUnavailable,
    BrowserUnavailable,
    Internal,
}

#[derive(Debug, Serialize, Type)]
pub(crate) struct IpcError {
    code: IpcErrorCode,
    message: &'static str,
}

impl IpcError {
    #[cfg(mobile)]
    pub(crate) fn folder_picker_unavailable() -> Self {
        Self {
            code: IpcErrorCode::FolderPickerUnavailable,
            message: "this platform has no folder picker yet",
        }
    }

    pub(crate) fn clipboard_unavailable(error: &dyn Error) -> Self {
        tracing::warn!(error = %describe(error), "copy the version details");
        Self {
            code: IpcErrorCode::ClipboardUnavailable,
            message: "the clipboard could not be written",
        }
    }

    pub(crate) fn browser_unavailable(error: &dyn Error) -> Self {
        tracing::warn!(error = %describe(error), "open a project page in the browser");
        Self {
            code: IpcErrorCode::BrowserUnavailable,
            message: "the browser could not be opened",
        }
    }

    pub(crate) fn internal(error: &dyn Error) -> Self {
        tracing::error!(error = %describe(error), "command failed");
        Self {
            code: IpcErrorCode::Internal,
            message: "something went wrong inside the app",
        }
    }
}

impl From<LibraryError> for IpcError {
    fn from(error: LibraryError) -> Self {
        let (code, message) = match error {
            LibraryError::Survey(_) => (
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
            LibraryError::CreateHome { .. }
            | LibraryError::Database(_)
            | LibraryError::Interrupted(_) => return Self::internal(&error),
        };
        tracing::warn!(error = %describe(&error), "library command refused");
        Self { code, message }
    }
}

fn describe(error: &dyn Error) -> String {
    let mut description = error.to_string();
    let mut cause = error.source();
    while let Some(source) = cause {
        description.push_str(": ");
        description.push_str(&source.to_string());
        cause = source.source();
    }
    description
}

#[cfg(test)]
mod tests {
    use std::{io, path::PathBuf};

    use omnileaf_engine::{FolderId, SurveyError};

    use super::*;

    fn code_for(error: LibraryError) -> IpcErrorCode {
        IpcError::from(error).code
    }

    #[test]
    fn tells_the_interface_which_library_failure_it_met() {
        let unreadable = SurveyError::Unreadable {
            path: PathBuf::from("/media/Sample Library"),
            source: io::Error::from(io::ErrorKind::PermissionDenied),
        };
        let id: FolderId = "7".parse().unwrap();

        let codes = [
            code_for(LibraryError::Survey(unreadable)),
            code_for(LibraryError::FolderNotFound { id }),
            code_for(LibraryError::HomeFolderKept { id }),
            code_for(LibraryError::CreateHome {
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
                IpcErrorCode::Internal,
            ]
        );
    }
}
