//! The error every fallible command returns: a stable code for the interface and a safe message.

use std::error::Error;

use omnileaf_engine::SurveyError;
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

impl From<SurveyError> for IpcError {
    fn from(error: SurveyError) -> Self {
        tracing::warn!(error = %describe(&error), "survey a library folder");
        Self {
            code: IpcErrorCode::FolderUnreadable,
            message: "the folder could not be read",
        }
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
