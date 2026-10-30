use std::fmt;

use serde::{Deserialize, Serialize};

use crate::bytes;

#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct StatusKey(#[serde(with = "bytes")] [u8; 32]);

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct StatusKeyHash(#[serde(with = "bytes")] [u8; 32]);

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct ChallengeId(#[serde(with = "bytes")] [u8; 16]);

impl StatusKey {
    #[must_use]
    pub fn from_bytes(bytes: [u8; 32]) -> Self {
        Self(bytes)
    }

    #[must_use]
    pub fn parse(text: &str) -> Option<Self> {
        bytes::decode(text).map(Self)
    }

    #[must_use]
    pub fn to_text(&self) -> String {
        bytes::encode(&self.0)
    }

    #[must_use]
    pub fn hash(&self) -> StatusKeyHash {
        StatusKeyHash(*blake3::hash(&self.0).as_bytes())
    }
}

impl fmt::Debug for StatusKey {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("StatusKey(..)")
    }
}

impl StatusKeyHash {
    #[must_use]
    pub fn from_bytes(bytes: [u8; 32]) -> Self {
        Self(bytes)
    }

    #[must_use]
    pub fn as_bytes(&self) -> &[u8; 32] {
        &self.0
    }

    #[must_use]
    pub fn matches(&self, other: &Self) -> bool {
        blake3::Hash::from_bytes(self.0) == blake3::Hash::from_bytes(other.0)
    }
}

impl ChallengeId {
    #[must_use]
    pub fn from_bytes(bytes: [u8; 16]) -> Self {
        Self(bytes)
    }

    #[must_use]
    pub fn as_bytes(&self) -> &[u8; 16] {
        &self.0
    }
}
