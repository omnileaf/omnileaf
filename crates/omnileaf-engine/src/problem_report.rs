use std::fmt;

use serde::Serialize;
use specta::Type;

use crate::{CleanedLog, ProjectLink, ReportCode, VersionDetails, crash_report::issue};

const CODE_LABEL: &str = "Report code:";
const LOG_HEADING: &str = "Log, names replaced:";
const NOTHING_LOGGED: &str = "Nothing logged yet.";
const ISSUE_URL_BYTE_LIMIT: usize = 8000;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ProblemReport {
    code: ReportCode,
    details: VersionDetails,
    log: CleanedLog,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ProblemReportPreview {
    pub code: ReportCode,
    pub version: String,
    pub system: Option<String>,
    pub log: Vec<String>,
}

impl ProblemReport {
    #[must_use]
    pub fn new(code: ReportCode, details: VersionDetails, log: CleanedLog) -> Self {
        Self { code, details, log }
    }

    #[must_use]
    pub fn preview(&self) -> ProblemReportPreview {
        ProblemReportPreview {
            code: self.code.clone(),
            version: self.details.app.version.clone(),
            system: self.details.system.clone(),
            log: self.log.lines().to_vec(),
        }
    }

    #[must_use]
    pub fn new_issue_url(&self) -> String {
        let whole = self.issue_url_leaving_out(0);
        if whole.len() <= ISSUE_URL_BYTE_LIMIT {
            return whole;
        }
        let counts: Vec<usize> = (1..=self.log.lines().len()).collect();
        let fewest = counts.partition_point(|left_out| {
            self.issue_url_leaving_out(*left_out).len() > ISSUE_URL_BYTE_LIMIT
        });
        self.issue_url_leaving_out(counts.get(fewest).copied().unwrap_or(counts.len()))
    }

    fn issue_url_leaving_out(&self, left_out: usize) -> String {
        let text = Leaving {
            report: self,
            left_out,
        }
        .to_string();
        issue::prefilled(
            ProjectLink::NewIssue.url(),
            &[
                ("platform", self.details.app.platform.name()),
                ("version", &self.details.app.version),
                ("logs", &text),
            ],
        )
    }
}

struct Leaving<'a> {
    report: &'a ProblemReport,
    left_out: usize,
}

impl fmt::Display for Leaving<'_> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let report = self.report;
        writeln!(f, "{CODE_LABEL} {}", report.code)?;
        writeln!(f, "{}", report.details)?;
        writeln!(f, "{LOG_HEADING}")?;
        let lines = report.log.lines();
        if lines.is_empty() {
            return writeln!(f, "{NOTHING_LOGGED}");
        }
        if self.left_out > 0 {
            writeln!(
                f,
                "({} older lines left out; Copy report has them all)",
                self.left_out
            )?;
        }
        lines
            .iter()
            .skip(self.left_out)
            .try_for_each(|line| writeln!(f, "{line}"))
    }
}

impl fmt::Display for ProblemReport {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        Leaving {
            report: self,
            left_out: 0,
        }
        .fmt(f)
    }
}
