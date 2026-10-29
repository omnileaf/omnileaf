use rusqlite::params;

use crate::{
    clock::{SECONDS_PER_DAY, UnixTime},
    rate_limit::forget_earlier_days,
    store::{Store, StoreError},
};

const REVIEWED: &str = "status IN ('published', 'closed')";

pub const TEXT_KEPT_AFTER_REVIEW_SECONDS: i64 = 90 * SECONDS_PER_DAY;
pub const RECORD_KEPT_AFTER_REVIEW_SECONDS: i64 = 365 * SECONDS_PER_DAY;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Purged {
    pub challenges: usize,
    pub report_texts: usize,
    pub reports: usize,
}

impl Store {
    pub fn purge(&self, now: UnixTime) -> Result<Purged, StoreError> {
        let text_cutoff = now.minus_seconds(TEXT_KEPT_AFTER_REVIEW_SECONDS).seconds();
        let record_cutoff = now
            .minus_seconds(RECORD_KEPT_AFTER_REVIEW_SECONDS)
            .seconds();
        self.transact(|transaction| {
            forget_earlier_days(transaction, now)?;
            let challenges = transaction.execute(
                "DELETE FROM challenges WHERE expires_at <= ?1",
                params![now.seconds()],
            )?;
            let reports = transaction.execute(
                &format!("DELETE FROM reports WHERE {REVIEWED} AND status_changed_at <= ?1"),
                params![record_cutoff],
            )?;
            transaction.execute(
                &format!(
                    "DELETE FROM reply_addresses WHERE code IN
                     (SELECT code FROM reports WHERE {REVIEWED} AND status_changed_at <= ?1)"
                ),
                params![text_cutoff],
            )?;
            let report_texts = transaction.execute(
                &format!(
                    "UPDATE reports SET report = NULL
                     WHERE {REVIEWED} AND status_changed_at <= ?1 AND report IS NOT NULL"
                ),
                params![text_cutoff],
            )?;
            Ok(Purged {
                challenges,
                report_texts,
                reports,
            })
        })
    }
}
