use crate::{ChallengeId, Platform, ReportCode, StatusKeyHash, limits::MAX_ACCEPTED_DIFFICULTY};

pub const SUBJECT_DOMAIN: &str = "omnileaf-relay subject v1";
pub const PROOF_DOMAIN: &str = "omnileaf-relay pow v1";
const ATTEMPTS_BETWEEN_GIVE_UP_CHECKS: u64 = 4096;
const ABSENT_FIELD: u8 = 0;
const PRESENT_FIELD: u8 = 1;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Subject([u8; 32]);

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct Difficulty(u8);

#[derive(Debug, PartialEq, Eq, thiserror::Error)]
#[error("a difficulty of {bits} bits is more than a phone can solve quickly")]
pub struct DifficultyTooHigh {
    bits: u32,
}

#[derive(Clone, Copy, Debug)]
pub struct ReportContent<'a> {
    pub code: &'a ReportCode,
    pub platform: Platform,
    pub version: &'a str,
    pub report: &'a str,
    pub reply_to: Option<&'a str>,
    pub status_key_hash: &'a StatusKeyHash,
}

#[derive(Clone, Copy, Debug)]
pub struct Puzzle<'a> {
    pub challenge: &'a ChallengeId,
    pub subject: &'a Subject,
    pub difficulty: Difficulty,
}

impl Subject {
    #[must_use]
    pub fn from_bytes(bytes: [u8; 32]) -> Self {
        Self(bytes)
    }

    #[must_use]
    pub fn as_bytes(&self) -> &[u8; 32] {
        &self.0
    }
}

impl Difficulty {
    #[must_use]
    pub fn bits(self) -> u8 {
        self.0
    }
}

impl TryFrom<u32> for Difficulty {
    type Error = DifficultyTooHigh;

    fn try_from(bits: u32) -> Result<Self, Self::Error> {
        u8::try_from(bits)
            .ok()
            .filter(|bits| *bits <= MAX_ACCEPTED_DIFFICULTY)
            .map(Self)
            .ok_or(DifficultyTooHigh { bits })
    }
}

impl ReportContent<'_> {
    #[must_use]
    pub fn subject(&self) -> Subject {
        let mut hasher = blake3::Hasher::new();
        hasher.update(SUBJECT_DOMAIN.as_bytes());
        for field in [
            Some(self.code.as_str()),
            Some(self.platform.as_str()),
            Some(self.version),
            Some(self.report),
        ] {
            write_field(&mut hasher, field);
        }
        write_field(&mut hasher, self.reply_to);
        hasher.update(self.status_key_hash.as_bytes());
        Subject(*hasher.finalize().as_bytes())
    }
}

impl Puzzle<'_> {
    #[must_use]
    pub fn solve(&self, mut should_give_up: impl FnMut() -> bool) -> Option<u64> {
        let mut nonce = 0;
        loop {
            if nonce % ATTEMPTS_BETWEEN_GIVE_UP_CHECKS == 0 && should_give_up() {
                return None;
            }
            if self.is_solved_by(nonce) {
                return Some(nonce);
            }
            nonce = nonce.checked_add(1)?;
        }
    }

    #[must_use]
    pub fn is_solved_by(&self, nonce: u64) -> bool {
        let mut hasher = blake3::Hasher::new();
        hasher.update(PROOF_DOMAIN.as_bytes());
        hasher.update(self.challenge.as_bytes());
        hasher.update(self.subject.as_bytes());
        hasher.update(&nonce.to_le_bytes());
        leading_zero_bits(hasher.finalize().as_bytes()) >= u32::from(self.difficulty.bits())
    }
}

fn write_field(hasher: &mut blake3::Hasher, field: Option<&str>) {
    match field {
        None => {
            hasher.update(&[ABSENT_FIELD]);
        }
        Some(text) => {
            hasher.update(&[PRESENT_FIELD]);
            hasher.update(&u64::try_from(text.len()).unwrap_or(u64::MAX).to_le_bytes());
            hasher.update(text.as_bytes());
        }
    }
}

fn leading_zero_bits(digest: &[u8; 32]) -> u32 {
    let zero_bytes = digest.iter().take_while(|byte| **byte == 0).count();
    let rest = digest
        .get(zero_bytes)
        .map_or(0, |byte| byte.leading_zeros());
    u32::try_from(zero_bytes * 8).unwrap_or(u32::MAX) + rest
}
