mod file;
mod issue;
mod offers;
mod scrub;
mod trace;

use std::fmt;

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::{AppInfo, Platform, ProjectLink};

pub use file::{CrashReportError, CrashReportFile};
pub use offers::{CrashReportOffers, UnsavedCrashReport};

const MESSAGE_BYTE_LIMIT: usize = 240;
const FRAME_LIMIT: usize = 12;
const FRAME_BYTE_LIMIT: usize = 120;
const TITLE_MESSAGE_BYTE_LIMIT: usize = 80;
const VERSION_BYTE_LIMIT: usize = 40;
const SYSTEM_BYTE_LIMIT: usize = 80;

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

/// What crashed: the app itself, or only its interface.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum CrashOrigin {
    Panic,
    Interface,
}

impl CrashOrigin {
    fn message_label(self) -> &'static str {
        match self {
            Self::Panic => "Panic",
            Self::Interface => "Interface error",
        }
    }

    fn what_happened(self) -> String {
        match self {
            Self::Panic => format!("{} closed unexpectedly.", AppInfo::NAME),
            Self::Interface => "The interface stopped on an unexpected error.".to_owned(),
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
    origin: CrashOrigin,
    message: String,
    location: Option<CodeLocation>,
    trace: Vec<String>,
}

/// Where a panic happened, with the file named from its package down.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
struct CodeLocation {
    file: String,
    line: u32,
    column: u32,
}

impl CodeLocation {
    fn package_relative(file: &str, line: u32, column: u32) -> Self {
        Self {
            file: scrub::bound(&trace::package_relative(file), FRAME_BYTE_LIMIT),
            line,
            column,
        }
    }
}

impl fmt::Display for CodeLocation {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}:{}:{}", self.file, self.line, self.column)
    }
}

impl CrashReport {
    #[must_use]
    pub fn from_panic(id: CrashReportId, app: CrashedApp, panic: &PanicDetails<'_>) -> Self {
        Self {
            id,
            app,
            origin: CrashOrigin::Panic,
            message: scrub::clean(panic.message, MESSAGE_BYTE_LIMIT),
            location: panic.location.map(|location| {
                CodeLocation::package_relative(location.file, location.line, location.column)
            }),
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
            origin: CrashOrigin::Interface,
            message: scrub::clean(&error.message, MESSAGE_BYTE_LIMIT),
            location: None,
            trace: clean_frames(stack.lines().map(str::trim).filter(|line| !line.is_empty())),
        }
    }

    #[must_use]
    pub fn id(&self) -> CrashReportId {
        self.id
    }

    #[must_use]
    pub fn origin(&self) -> CrashOrigin {
        self.origin
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
                ("what-happened", &self.origin.what_happened()),
                ("platform", self.app.platform.name()),
                ("version", &self.app.version),
                ("logs", &self.to_string()),
            ],
        )
    }
}

/// How a report is kept on disk; reading one back cleans its text again, since the file is outside the app's control.
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredCrashReport {
    id: u64,
    version: String,
    platform: Platform,
    system: Option<String>,
    origin: CrashOrigin,
    message: String,
    location: Option<CodeLocation>,
    trace: Vec<String>,
}

impl From<&CrashReport> for StoredCrashReport {
    fn from(report: &CrashReport) -> Self {
        Self {
            id: report.id.0,
            version: report.app.version.clone(),
            platform: report.app.platform,
            system: report.app.system.clone(),
            origin: report.origin,
            message: report.message.clone(),
            location: report.location.clone(),
            trace: report.trace.clone(),
        }
    }
}

impl From<StoredCrashReport> for CrashReport {
    fn from(stored: StoredCrashReport) -> Self {
        Self {
            id: CrashReportId(stored.id),
            app: CrashedApp {
                version: scrub::clean(&stored.version, VERSION_BYTE_LIMIT),
                platform: stored.platform,
                system: stored
                    .system
                    .map(|system| scrub::clean(&system, SYSTEM_BYTE_LIMIT)),
            },
            origin: stored.origin,
            message: scrub::clean(&stored.message, MESSAGE_BYTE_LIMIT),
            location: stored.location.map(|location| {
                CodeLocation::package_relative(&location.file, location.line, location.column)
            }),
            trace: clean_frames(stored.trace.iter().map(String::as_str)),
        }
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
        write!(
            f,
            "{} {} on {}",
            AppInfo::NAME,
            self.app.version,
            self.app.platform.name()
        )?;
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
