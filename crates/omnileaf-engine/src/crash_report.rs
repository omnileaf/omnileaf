mod scrub;
mod trace;

use std::fmt;

use serde::Deserialize;
use specta::Type;

use crate::{Platform, platform_name};

const APP_NAME: &str = "Omnileaf";
const MESSAGE_LIMIT: usize = 200;
const FRAME_LIMIT: usize = 16;
const FRAME_NAME_LIMIT: usize = 100;
const RAW_TEXT_LIMIT: usize = 8 * MESSAGE_LIMIT * FRAME_LIMIT;

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
            message: clean_message(panic.message),
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
            message: clean_message(&error.message),
            location: None,
            trace: clean_frames(stack.lines().map(str::trim).filter(|line| !line.is_empty())),
        }
    }

    #[must_use]
    pub fn id(&self) -> CrashReportId {
        self.id
    }
}

fn clean_message(message: &str) -> String {
    let bounded = scrub::shorten(message, RAW_TEXT_LIMIT);
    scrub::shorten(&scrub::scrub(&bounded), MESSAGE_LIMIT)
}

fn clean_frames<'a>(frames: impl IntoIterator<Item = &'a str>) -> Vec<String> {
    frames
        .into_iter()
        .take(FRAME_LIMIT)
        .map(|frame| {
            let bounded = scrub::shorten(frame, RAW_TEXT_LIMIT);
            scrub::shorten(&scrub::scrub(&bounded), FRAME_NAME_LIMIT)
        })
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
