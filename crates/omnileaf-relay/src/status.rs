use omnileaf_relay_proto::ReportStatus;
use rusqlite::Row;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct IssueNumber(u64);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StatusKind {
    Received,
    Reviewing,
    Published,
    Closed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ReviewStatus {
    Received,
    Reviewing,
    Published(IssueNumber),
    Closed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TargetStatus {
    Reviewing,
    Published(IssueNumber),
    Closed,
}

impl IssueNumber {
    #[must_use]
    pub fn new(number: u64) -> Option<Self> {
        (number > 0 && i64::try_from(number).is_ok()).then_some(Self(number))
    }

    #[must_use]
    pub fn get(self) -> u64 {
        self.0
    }
}

impl StatusKind {
    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Received => "received",
            Self::Reviewing => "reviewing",
            Self::Published => "published",
            Self::Closed => "closed",
        }
    }
}

impl ReviewStatus {
    pub(crate) fn kind(self) -> StatusKind {
        match self {
            Self::Received => StatusKind::Received,
            Self::Reviewing => StatusKind::Reviewing,
            Self::Published(_) => StatusKind::Published,
            Self::Closed => StatusKind::Closed,
        }
    }

    pub(crate) fn issue(self) -> Option<IssueNumber> {
        match self {
            Self::Published(issue) => Some(issue),
            Self::Received | Self::Reviewing | Self::Closed => None,
        }
    }

    #[must_use]
    pub fn can_become(self, target: TargetStatus) -> bool {
        match (self, target) {
            (Self::Received, _)
            | (Self::Reviewing, TargetStatus::Published(_) | TargetStatus::Closed)
            | (Self::Closed, TargetStatus::Reviewing) => true,
            (Self::Reviewing, TargetStatus::Reviewing)
            | (Self::Closed, TargetStatus::Published(_) | TargetStatus::Closed)
            | (Self::Published(_), _) => false,
        }
    }

    pub(crate) fn from_row(row: &Row<'_>, status: &str, issue: &str) -> rusqlite::Result<Self> {
        let text: String = row.get(status)?;
        let number: Option<i64> = row.get(issue)?;
        let issue = number
            .and_then(|number| u64::try_from(number).ok())
            .and_then(IssueNumber::new);
        match (text.as_str(), issue) {
            ("received", None) => Ok(Self::Received),
            ("reviewing", None) => Ok(Self::Reviewing),
            ("published", Some(issue)) => Ok(Self::Published(issue)),
            ("closed", None) => Ok(Self::Closed),
            _ => Err(rusqlite::Error::InvalidColumnName(format!(
                "status {text} with issue {number:?}"
            ))),
        }
    }
}

impl From<TargetStatus> for ReviewStatus {
    fn from(target: TargetStatus) -> Self {
        match target {
            TargetStatus::Reviewing => Self::Reviewing,
            TargetStatus::Published(issue) => Self::Published(issue),
            TargetStatus::Closed => Self::Closed,
        }
    }
}

impl From<ReviewStatus> for ReportStatus {
    fn from(status: ReviewStatus) -> Self {
        match status {
            ReviewStatus::Received => Self::Received,
            ReviewStatus::Reviewing => Self::Reviewing,
            ReviewStatus::Published(issue) => Self::Published { issue: issue.get() },
            ReviewStatus::Closed => Self::Closed,
        }
    }
}
