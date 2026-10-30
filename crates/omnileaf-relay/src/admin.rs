use std::fmt;

use omnileaf_relay_proto::ReportCode;
use rusqlite::{OptionalExtension, Row, params};

use crate::{
    clock::UnixTime,
    inert_text::{InertLine, InertText},
    status::{IssueNumber, ReviewStatus, StatusKind, TargetStatus},
    store::{Store, StoreError},
    utc::UtcText,
};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ListedReport {
    pub code: String,
    pub received_at: UnixTime,
    pub status: ReviewStatus,
    pub platform: String,
    pub version: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ReplyAddressView {
    Hidden,
    Shown,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ShownReport {
    pub listed: ListedReport,
    pub report: Option<String>,
    pub reply_address: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StatusChange {
    Changed,
    NotFound,
    Refused { from: ReviewStatus },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Export {
    Ready(String),
    NotFound,
    Purged,
}

impl Store {
    pub fn list(
        &self,
        filter: Option<StatusKind>,
        limit: u32,
    ) -> Result<Vec<ListedReport>, StoreError> {
        self.transact(|transaction| {
            let mut rows = transaction.prepare(&format!(
                "SELECT {LISTED_COLUMNS} FROM reports
                 WHERE ?1 IS NULL OR status = ?1
                 ORDER BY received_at DESC, code LIMIT ?2"
            ))?;
            let listed = rows
                .query_map(params![filter.map(StatusKind::as_str), limit], listed_from)?
                .collect::<Result<_, _>>()?;
            Ok(listed)
        })
    }

    pub fn show(
        &self,
        code: &ReportCode,
        view: ReplyAddressView,
    ) -> Result<Option<ShownReport>, StoreError> {
        self.transact(|transaction| {
            let found = transaction
                .query_row(
                    &format!("SELECT {LISTED_COLUMNS}, report FROM reports WHERE code = ?1"),
                    params![code.as_str()],
                    |row| Ok((listed_from(row)?, row.get::<_, Option<String>>("report")?)),
                )
                .optional()?;
            let Some((listed, report)) = found else {
                return Ok(None);
            };
            let reply_address = match view {
                ReplyAddressView::Hidden => None,
                ReplyAddressView::Shown => transaction
                    .query_row(
                        "SELECT address FROM reply_addresses WHERE code = ?1",
                        params![code.as_str()],
                        |row| row.get(0),
                    )
                    .optional()?,
            };
            Ok(Some(ShownReport {
                listed,
                report,
                reply_address,
            }))
        })
    }

    pub fn set_status(
        &self,
        code: &ReportCode,
        target: TargetStatus,
        now: UnixTime,
    ) -> Result<StatusChange, StoreError> {
        self.transact(|transaction| {
            let current = transaction
                .query_row(
                    "SELECT status, issue FROM reports WHERE code = ?1",
                    params![code.as_str()],
                    |row| ReviewStatus::from_row(row, "status", "issue"),
                )
                .optional()?;
            let Some(current) = current else {
                return Ok(StatusChange::NotFound);
            };
            if !current.can_become(target) {
                return Ok(StatusChange::Refused { from: current });
            }
            let next = ReviewStatus::from(target);
            transaction.execute(
                "UPDATE reports SET status = ?2, issue = ?3, status_changed_at = ?4
                 WHERE code = ?1",
                params![
                    code.as_str(),
                    next.kind().as_str(),
                    next.issue().map(IssueNumber::get),
                    now.seconds()
                ],
            )?;
            Ok(StatusChange::Changed)
        })
    }

    pub fn export(&self, code: &ReportCode) -> Result<Export, StoreError> {
        Ok(match self.show(code, ReplyAddressView::Hidden)? {
            None => Export::NotFound,
            Some(ShownReport { report: None, .. }) => Export::Purged,
            Some(ShownReport {
                listed,
                report: Some(report),
                ..
            }) => Export::Ready(issue_body(&listed, &report)),
        })
    }
}

const LISTED_COLUMNS: &str = "code, received_at, status, issue, platform, version";
const SHORTEST_FENCE: usize = 3;

fn listed_from(row: &Row<'_>) -> rusqlite::Result<ListedReport> {
    Ok(ListedReport {
        code: row.get("code")?,
        received_at: UnixTime::from_seconds(row.get("received_at")?),
        status: ReviewStatus::from_row(row, "status", "issue")?,
        platform: row.get("platform")?,
        version: row.get("version")?,
    })
}

fn issue_body(listed: &ListedReport, report: &str) -> String {
    let fence = "`".repeat(longest_backtick_run(report).max(SHORTEST_FENCE - 1) + 1);
    format!(
        "Sent from Omnileaf {} on {}.\n\n{fence}text\n{}\n{fence}\n",
        InertLine(&listed.version),
        InertLine(&listed.platform),
        InertText(report.trim_end())
    )
}

fn longest_backtick_run(text: &str) -> usize {
    text.split(|character| character != '`')
        .map(str::len)
        .max()
        .unwrap_or(0)
}

impl fmt::Display for ReviewStatus {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Published(issue) => write!(f, "published #{}", issue.get()),
            Self::Duplicate(issue) => write!(f, "duplicate of #{}", issue.get()),
            Self::Received | Self::Reviewing | Self::Closed => f.write_str(self.kind().as_str()),
        }
    }
}

impl fmt::Display for ListedReport {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "{}  {}  {}  {}  {}",
            InertLine(&self.code),
            UtcText(self.received_at),
            self.status,
            InertLine(&self.platform),
            InertLine(&self.version)
        )
    }
}

impl fmt::Display for ShownReport {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        writeln!(f, "{}", self.listed)?;
        if let Some(address) = &self.reply_address {
            writeln!(f, "Reply to: {}", InertLine(address))?;
        }
        writeln!(f)?;
        match &self.report {
            Some(report) => write!(f, "{}", InertText(report)),
            None => writeln!(f, "The report's text was removed."),
        }
    }
}
