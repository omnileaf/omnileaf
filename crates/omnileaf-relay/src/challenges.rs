use omnileaf_relay_proto::{Challenge, ChallengeId, pow::Difficulty};
use rusqlite::{OptionalExtension, params};

use crate::{
    clock::UnixTime,
    store::{Store, StoreError, random_bytes},
};

pub const CHALLENGE_LIFETIME_SECONDS: i64 = 10 * 60;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ChallengeIssue {
    Issued(Challenge),
    TooManyOutstanding,
}

#[derive(Clone, Copy, Debug)]
pub struct ChallengeTerms {
    pub difficulty: Difficulty,
    pub outstanding_limit: u32,
}

impl Store {
    pub fn issue_challenge(
        &self,
        terms: ChallengeTerms,
        now: UnixTime,
    ) -> Result<ChallengeIssue, StoreError> {
        let id = ChallengeId::from_bytes(random_bytes()?);
        let expires_at = now.plus_seconds(CHALLENGE_LIFETIME_SECONDS);
        self.transact(|transaction| {
            let outstanding: u32 = transaction.query_row(
                "SELECT count(*) FROM challenges WHERE expires_at > ?1",
                params![now.seconds()],
                |row| row.get(0),
            )?;
            if outstanding >= terms.outstanding_limit {
                return Ok(ChallengeIssue::TooManyOutstanding);
            }
            transaction.execute(
                "INSERT INTO challenges (id, difficulty, expires_at) VALUES (?1, ?2, ?3)",
                params![id.as_bytes(), terms.difficulty.bits(), expires_at.seconds()],
            )?;
            Ok(ChallengeIssue::Issued(Challenge {
                id,
                difficulty: u32::from(terms.difficulty.bits()),
                expires_at: expires_at.seconds(),
            }))
        })
    }

    pub fn take_challenge(
        &self,
        id: &ChallengeId,
        now: UnixTime,
    ) -> Result<Option<Difficulty>, StoreError> {
        self.transact(|transaction| {
            let bits: Option<u32> = transaction
                .query_row(
                    "DELETE FROM challenges WHERE id = ?1 AND expires_at > ?2 RETURNING difficulty",
                    params![id.as_bytes(), now.seconds()],
                    |row| row.get(0),
                )
                .optional()?;
            Ok(bits.and_then(|bits| Difficulty::try_from(bits).ok()))
        })
    }
}
