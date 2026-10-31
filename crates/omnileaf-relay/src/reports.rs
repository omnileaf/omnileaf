use omnileaf_relay_proto::{
    Platform, ReplyAddress, ReportCode, ReportStatus, StatusKeyHash, StatusLookup, StatusReply,
    pow::Subject,
};
use rusqlite::{OptionalExtension, Transaction, params};

use crate::{
    clock::UnixTime,
    problem,
    status::ReviewStatus,
    store::{Store, StoreError},
};

#[derive(Clone, Debug)]
pub struct NewReport {
    pub code: ReportCode,
    pub status_key_hash: StatusKeyHash,
    pub body_hash: Subject,
    pub platform: Platform,
    pub version: String,
    pub report: String,
    pub reply_to: Option<ReplyAddress>,
    pub received_at: UnixTime,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct IntakeCaps {
    pub reports_per_day: u32,
    pub pending_reports: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Intake {
    Inserted,
    AlreadyReceived,
    CodeTaken,
    DailyCapReached,
    PendingCapReached,
}

struct StoredFingerprint {
    status_key_hash: StatusKeyHash,
    body_hash: Subject,
}

impl NewReport {
    fn is_stored_as(&self, stored: &StoredFingerprint) -> bool {
        self.status_key_hash.matches(&stored.status_key_hash)
            && blake3::Hash::from_bytes(*self.body_hash.as_bytes())
                == blake3::Hash::from_bytes(*stored.body_hash.as_bytes())
    }
}

impl Store {
    pub fn is_already_received(&self, report: &NewReport) -> Result<bool, StoreError> {
        self.transact(|transaction| {
            Ok(fingerprint(transaction, report.code.as_str())?
                .is_some_and(|stored| report.is_stored_as(&stored)))
        })
    }

    pub fn take_in(&self, report: &NewReport, caps: IntakeCaps) -> Result<Intake, StoreError> {
        self.transact(|transaction| {
            if let Some(stored) = fingerprint(transaction, report.code.as_str())? {
                return Ok(if report.is_stored_as(&stored) {
                    Intake::AlreadyReceived
                } else {
                    Intake::CodeTaken
                });
            }
            let (today, pending): (u32, u32) = transaction.query_row(
                "SELECT count(*) FILTER (WHERE received_at >= ?1),
                        count(*) FILTER (WHERE status = 'received')
                 FROM reports",
                params![report.received_at.start_of_day().seconds()],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )?;
            if today >= caps.reports_per_day {
                return Ok(Intake::DailyCapReached);
            }
            if pending >= caps.pending_reports {
                return Ok(Intake::PendingCapReached);
            }
            insert(transaction, report)?;
            Ok(Intake::Inserted)
        })
    }

    pub fn statuses(&self, lookups: &[StatusLookup]) -> Result<Vec<StatusReply>, StoreError> {
        self.transact(|transaction| {
            lookups
                .iter()
                .map(|lookup| {
                    Ok(StatusReply {
                        code: lookup.code.clone(),
                        status: status_for(transaction, lookup)?,
                    })
                })
                .collect()
        })
    }
}

fn fingerprint(
    transaction: &Transaction<'_>,
    code: &str,
) -> Result<Option<StoredFingerprint>, StoreError> {
    Ok(transaction
        .query_row(
            "SELECT status_key_hash, body_hash FROM reports WHERE code = ?1",
            params![code],
            |row| {
                Ok(StoredFingerprint {
                    status_key_hash: StatusKeyHash::from_bytes(row.get(0)?),
                    body_hash: Subject::from_bytes(row.get(1)?),
                })
            },
        )
        .optional()?)
}

fn insert(transaction: &Transaction<'_>, report: &NewReport) -> Result<(), StoreError> {
    let problem = problem::fingerprint(&report.report);
    let folded_into = match problem {
        Some(fingerprint) => issue_of_same_problem(transaction, &fingerprint, report.platform)?,
        None => None,
    };
    let status = if folded_into.is_some() {
        "duplicate"
    } else {
        "received"
    };
    transaction.execute(
        "INSERT INTO reports (code, status_key_hash, body_hash, platform, version, report,
                              received_at, status_changed_at, problem, status, issue)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7, ?8, ?9, ?10)",
        params![
            report.code.as_str(),
            report.status_key_hash.as_bytes(),
            report.body_hash.as_bytes(),
            report.platform.as_str(),
            report.version,
            report.report,
            report.received_at.seconds(),
            problem,
            status,
            folded_into,
        ],
    )?;
    if let Some(address) = &report.reply_to {
        transaction.execute(
            "INSERT INTO reply_addresses (code, address) VALUES (?1, ?2)",
            params![report.code.as_str(), address.as_str()],
        )?;
    }
    Ok(())
}

fn issue_of_same_problem(
    transaction: &Transaction<'_>,
    problem: &[u8; 32],
    platform: Platform,
) -> Result<Option<i64>, StoreError> {
    Ok(transaction
        .query_row(
            "SELECT issue FROM reports
             WHERE problem = ?1 AND platform = ?2 AND issue IS NOT NULL
             ORDER BY (status = 'published') DESC, received_at LIMIT 1",
            params![problem, platform.as_str()],
            |row| row.get(0),
        )
        .optional()?)
}

fn status_for(
    transaction: &Transaction<'_>,
    lookup: &StatusLookup,
) -> Result<ReportStatus, StoreError> {
    let asked = lookup.status_key.hash();
    let stored = transaction
        .query_row(
            "SELECT status_key_hash, status, issue FROM reports WHERE code = ?1",
            params![lookup.code],
            |row| {
                Ok((
                    StatusKeyHash::from_bytes(row.get(0)?),
                    ReviewStatus::from_row(row, "status", "issue")?,
                ))
            },
        )
        .optional()?;
    Ok(match stored {
        Some((hash, status)) if hash.matches(&asked) => status.into(),
        Some(_) | None => ReportStatus::Unknown,
    })
}
