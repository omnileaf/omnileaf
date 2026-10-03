mod issue;
mod scrub;
mod trace;

use std::fmt;

use serde::Deserialize;
use specta::Type;

use crate::{Platform, ProjectLink, platform_name};

const APP_NAME: &str = "Omnileaf";
const MESSAGE_BYTE_LIMIT: usize = 240;
const FRAME_LIMIT: usize = 12;
const FRAME_BYTE_LIMIT: usize = 120;
const TITLE_MESSAGE_BYTE_LIMIT: usize = 80;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct CrashReportId(u64);

impl CrashReportId {
    #[must_use]
    pub fn from_millis(millis_since_epoch: u64) -> Self {
        Self(millis_since_epoch)
    }
}

/// The running app a crash report describes.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CrashedApp {
    pub version: String,
    pub platform: Platform,
    pub system: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SourceLocation<'a> {
    pub file: &'a str,
    pub line: u32,
    pub column: u32,
}

/// What a panic hook sees, before anything personal is taken out.
#[derive(Clone, Copy, Debug)]
pub struct PanicDetails<'a> {
    pub message: &'a str,
    pub location: Option<SourceLocation<'a>>,
    pub backtrace: &'a str,
}

/// An error the interface didn't handle, as the webview describes it.
#[derive(Clone, Debug, PartialEq, Eq, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct InterfaceError {
    pub message: String,
    pub stack: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Origin {
    Panic,
    Interface,
}

impl Origin {
    fn message_label(self) -> &'static str {
        match self {
            Self::Panic => "Panic",
            Self::Interface => "Interface error",
        }
    }

    fn what_happened(self) -> &'static str {
        match self {
            Self::Panic => "Omnileaf closed unexpectedly.",
            Self::Interface => "The interface stopped on an unexpected error.",
        }
    }

    fn trace_label(self) -> &'static str {
        match self {
            Self::Panic => "Backtrace",
            Self::Interface => "Stack",
        }
    }
}

/// A report about one crash, holding only text with names and paths taken out.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CrashReport {
    id: CrashReportId,
    app: CrashedApp,
    origin: Origin,
    message: String,
    location: Option<String>,
    trace: Vec<String>,
}

impl CrashReport {
    #[must_use]
    pub fn from_panic(id: CrashReportId, app: CrashedApp, panic: &PanicDetails<'_>) -> Self {
        Self {
            id,
            app,
            origin: Origin::Panic,
            message: scrub::clean(panic.message, MESSAGE_BYTE_LIMIT),
            location: panic.location.map(trace::package_relative),
            trace: clean_frames(trace::frame_names(panic.backtrace)),
        }
    }

    #[must_use]
    pub fn from_interface_error(
        id: CrashReportId,
        app: CrashedApp,
        error: &InterfaceError,
    ) -> Self {
        let stack = error.stack.as_deref().unwrap_or_default();
        Self {
            id,
            app,
            origin: Origin::Interface,
            message: scrub::clean(&error.message, MESSAGE_BYTE_LIMIT),
            location: None,
            trace: clean_frames(stack.lines().map(str::trim).filter(|line| !line.is_empty())),
        }
    }

    #[must_use]
    pub fn id(&self) -> CrashReportId {
        self.id
    }

    /// A new bug report in the project's tracker, filled in with this report for the person to read and submit.
    #[must_use]
    pub fn new_issue_url(&self) -> String {
        let title = format!(
            "Crash: {}",
            scrub::clean(&self.message, TITLE_MESSAGE_BYTE_LIMIT)
        );
        issue::prefilled(
            ProjectLink::NewIssue.url(),
            &[
                ("title", &title),
                ("what-happened", self.origin.what_happened()),
                ("platform", platform_name(self.app.platform)),
                ("version", &self.app.version),
                ("logs", &self.to_string()),
            ],
        )
    }
}

fn clean_frames<'a>(frames: impl IntoIterator<Item = &'a str>) -> Vec<String> {
    frames
        .into_iter()
        .take(FRAME_LIMIT)
        .map(|frame| scrub::clean(frame, FRAME_BYTE_LIMIT))
        .collect()
}

impl fmt::Display for CrashReport {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let platform = platform_name(self.app.platform);
        write!(f, "{APP_NAME} {} on {platform}", self.app.version)?;
        match &self.app.system {
            Some(system) => writeln!(f, " ({system})")?,
            None => writeln!(f)?,
        }
        writeln!(f, "{}: {}", self.origin.message_label(), self.message)?;
        if let Some(location) = &self.location {
            writeln!(f, "At: {location}")?;
        }
        if self.trace.is_empty() {
            return Ok(());
        }
        writeln!(f, "{}:", self.origin.trace_label())?;
        self.trace
            .iter()
            .try_for_each(|frame| writeln!(f, "  {frame}"))
    }
}
