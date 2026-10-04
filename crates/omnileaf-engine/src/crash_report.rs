mod trace;

use std::fmt;

use crate::{AppInfo, Platform};

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

/// A report about one crash, as text the person can read before deciding to send it.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CrashReport {
    id: CrashReportId,
    app: CrashedApp,
    message: String,
    location: Option<CodeLocation>,
    trace: Vec<String>,
}

/// Where a panic happened, with the file named from its package down.
#[derive(Clone, Debug, PartialEq, Eq)]
struct CodeLocation {
    file: String,
    line: u32,
    column: u32,
}

impl CodeLocation {
    fn package_relative(file: &str, line: u32, column: u32) -> Self {
        Self {
            file: trace::package_relative(file),
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
            message: panic.message.to_owned(),
            location: panic.location.map(|location| {
                CodeLocation::package_relative(location.file, location.line, location.column)
            }),
            trace: trace::frame_names(panic.backtrace)
                .into_iter()
                .map(str::to_owned)
                .collect(),
        }
    }

    #[must_use]
    pub fn id(&self) -> CrashReportId {
        self.id
    }
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
        writeln!(f, "Panic: {}", self.message)?;
        if let Some(location) = &self.location {
            writeln!(f, "At: {location}")?;
        }
        if self.trace.is_empty() {
            return Ok(());
        }
        writeln!(f, "Backtrace:")?;
        self.trace
            .iter()
            .try_for_each(|frame| writeln!(f, "  {frame}"))
    }
}
