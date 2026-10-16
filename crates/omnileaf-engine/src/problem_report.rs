use std::fmt;

use serde::Serialize;
use specta::Type;

use crate::{LogStandIns, VersionDetails};

const LOG_HEADING: &str = "Log, names replaced:";
const NOTHING_LOGGED: &str = "Nothing logged yet.";

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ProblemReport {
    details: VersionDetails,
    log: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ProblemReportPreview {
    pub version: String,
    pub system: Option<String>,
    pub log: Vec<String>,
}

impl ProblemReport {
    #[must_use]
    pub fn new(details: VersionDetails, log: &[String], stand_ins: &LogStandIns) -> Self {
        Self {
            details,
            log: log.iter().map(|line| stand_ins.clean(line)).collect(),
        }
    }

    #[must_use]
    pub fn preview(&self) -> ProblemReportPreview {
        ProblemReportPreview {
            version: self.details.app.version.clone(),
            system: self.details.system.clone(),
            log: self.log.clone(),
        }
    }
}

impl fmt::Display for ProblemReport {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        writeln!(f, "{}", self.details)?;
        writeln!(f, "{LOG_HEADING}")?;
        if self.log.is_empty() {
            return writeln!(f, "{NOTHING_LOGGED}");
        }
        self.log.iter().try_for_each(|line| writeln!(f, "{line}"))
    }
}
