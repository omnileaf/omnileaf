use serde::{Deserialize, Serialize};

use crate::{ChallengeId, Platform, ReportCode, StatusKey, StatusKeyHash};

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ChallengeRequest {}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Challenge {
    pub id: ChallengeId,
    pub difficulty: u32,
    pub expires_at: i64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ReportSubmission {
    pub code: String,
    pub platform: Platform,
    pub version: String,
    pub report: String,
    pub reply_to: Option<String>,
    pub status_key_hash: StatusKeyHash,
    pub proof: Proof,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Proof {
    pub challenge: ChallengeId,
    pub nonce: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportReceipt {
    pub code: ReportCode,
    #[serde(flatten)]
    pub status: ReportStatus,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "status")]
pub enum ReportStatus {
    Received,
    Reviewing,
    Published { issue: u64 },
    Closed,
    Unknown,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StatusLookups {
    pub reports: Vec<StatusLookup>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StatusLookup {
    pub code: String,
    pub status_key: StatusKey,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusReplies {
    pub reports: Vec<StatusReply>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusReply {
    pub code: String,
    #[serde(flatten)]
    pub status: ReportStatus,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ErrorBody {
    pub error: ErrorDetail,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ErrorDetail {
    pub code: ErrorCode,
    pub message: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ErrorCode {
    BadRequest,
    UnsupportedMediaType,
    TooLarge,
    InvalidCode,
    InvalidReplyAddress,
    ChallengeUnknown,
    ProofRejected,
    CodeTaken,
    RateLimited,
    RelayBusy,
    Internal,
    #[serde(other)]
    Unrecognised,
}
