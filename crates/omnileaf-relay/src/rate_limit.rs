use rusqlite::{OptionalExtension, Transaction, params};

use crate::{
    client_ip::ClientAddress,
    clock::UnixTime,
    store::{Store, StoreError, random_bytes},
};

const SALT_BYTES: usize = 32;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Action {
    Challenge,
    Report,
    Status,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ActionLimit {
    pub per_hour: u32,
    pub per_day: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Limits {
    pub challenge: ActionLimit,
    pub report: ActionLimit,
    pub status: ActionLimit,
    pub outstanding_challenges: u32,
    pub reports_per_day: u32,
    pub pending_reports: u32,
    pub concurrent_requests: usize,
}

#[derive(Clone, Copy, Debug)]
pub struct Attempt<'a> {
    pub address: &'a ClientAddress,
    pub action: Action,
    pub at: UnixTime,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Admission {
    Admitted,
    Limited { retry_after_seconds: u64 },
}

impl Default for Limits {
    fn default() -> Self {
        Self {
            challenge: ActionLimit {
                per_hour: 20,
                per_day: 60,
            },
            report: ActionLimit {
                per_hour: 5,
                per_day: 20,
            },
            status: ActionLimit {
                per_hour: 60,
                per_day: 500,
            },
            outstanding_challenges: 10_000,
            reports_per_day: 500,
            pending_reports: 2_000,
            concurrent_requests: 32,
        }
    }
}

impl Limits {
    #[must_use]
    pub fn for_action(&self, action: Action) -> ActionLimit {
        match action {
            Action::Challenge => self.challenge,
            Action::Report => self.report,
            Action::Status => self.status,
        }
    }
}

impl Action {
    fn as_str(self) -> &'static str {
        match self {
            Self::Challenge => "challenge",
            Self::Report => "report",
            Self::Status => "status",
        }
    }
}

impl Store {
    pub fn admit(&self, attempt: Attempt<'_>, limit: ActionLimit) -> Result<Admission, StoreError> {
        self.transact(|transaction| {
            let salt = salt_for_day(transaction, attempt.at)?;
            let ip_hash = blake3::keyed_hash(&salt, attempt.address.bucket_bytes());
            let action = attempt.action.as_str();
            let (this_hour, today): (u32, u32) = transaction.query_row(
                "SELECT coalesce(sum(count) FILTER (WHERE hour = ?3), 0), coalesce(sum(count), 0)
                 FROM ip_counts WHERE ip_hash = ?1 AND action = ?2 AND hour >= ?4",
                params![
                    ip_hash.as_bytes(),
                    action,
                    attempt.at.hour(),
                    attempt.at.first_hour_of_day()
                ],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )?;
            if today >= limit.per_day {
                return Ok(Admission::Limited {
                    retry_after_seconds: attempt.at.seconds_to_next_day(),
                });
            }
            if this_hour >= limit.per_hour {
                return Ok(Admission::Limited {
                    retry_after_seconds: attempt.at.seconds_to_next_hour(),
                });
            }
            transaction.execute(
                "INSERT INTO ip_counts (ip_hash, action, hour, count) VALUES (?1, ?2, ?3, 1)
                 ON CONFLICT (ip_hash, action, hour) DO UPDATE SET count = count + 1",
                params![ip_hash.as_bytes(), action, attempt.at.hour()],
            )?;
            Ok(Admission::Admitted)
        })
    }
}

fn salt_for_day(
    transaction: &Transaction<'_>,
    at: UnixTime,
) -> Result<[u8; SALT_BYTES], StoreError> {
    let stored: Option<[u8; SALT_BYTES]> = transaction
        .query_row(
            "SELECT salt FROM ip_salts WHERE day = ?1",
            params![at.day()],
            |row| row.get(0),
        )
        .optional()?;
    if let Some(salt) = stored {
        return Ok(salt);
    }
    forget_earlier_days(transaction, at)?;
    let fresh_salt = random_bytes()?;
    transaction.execute(
        "INSERT INTO ip_salts (day, salt) VALUES (?1, ?2)",
        params![at.day(), fresh_salt],
    )?;
    Ok(fresh_salt)
}

pub(crate) fn forget_earlier_days(
    transaction: &Transaction<'_>,
    at: UnixTime,
) -> Result<(), StoreError> {
    transaction.execute("DELETE FROM ip_salts WHERE day < ?1", params![at.day()])?;
    transaction.execute(
        "DELETE FROM ip_counts WHERE hour < ?1",
        params![at.first_hour_of_day()],
    )?;
    Ok(())
}
