use std::fmt;

use omnileaf_engine::{Platform as AppPlatform, ProblemReport, ReportCode};
use omnileaf_relay_proto::{
    Platform, ReplyAddress, ReportStatus, StatusKey, StatusLookup, StatusReply,
};
use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, Manager};

use crate::{
    ipc_error::IpcError,
    problem_reporting::{self, ShownProblemReport},
    report_relay::{OutgoingReport, RelayClient, RelayError},
};

#[derive(PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SentProblemReport {
    code: ReportCode,
    status_key: String,
}

#[derive(Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SentReportKey {
    code: ReportCode,
    status_key: String,
}

const SENDING: &str = "send a problem report";
const LOOKING_UP: &str = "look up problem report statuses";

#[derive(Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProblemReportStatus {
    code: ReportCode,
    review: ReportReview,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub(crate) enum ReportReview {
    Received,
    Reviewing,
    Published { issue: u32 },
    Duplicate { issue: u32 },
    Closed,
    Unknown,
}

pub(crate) async fn send(
    app: &AppHandle,
    reply_to: Option<String>,
) -> Result<SentProblemReport, IpcError> {
    let reply_to = reply_address(reply_to.as_deref())?;
    let report = problem_reporting::shown_or_gathered(app).await?;
    let status_key = app
        .state::<ShownProblemReport>()
        .status_key_for(report.code())?;
    let outgoing = outgoing(&report, reply_to, status_key)?;
    let sent = async { relay(app)?.send(&outgoing).await }.await;
    sent.map_err(|error| IpcError::from_relay(&error, SENDING))?;
    Ok(SentProblemReport {
        code: report.code().clone(),
        status_key: outgoing.status_key.to_text(),
    })
}

pub(crate) async fn statuses(
    app: &AppHandle,
    keys: Vec<SentReportKey>,
) -> Result<Vec<ProblemReportStatus>, IpcError> {
    let lookups: Vec<StatusLookup> = keys.iter().filter_map(lookup_of).collect();
    let replies = if lookups.is_empty() {
        Vec::new()
    } else {
        let answered = async { relay(app)?.statuses(lookups).await }.await;
        answered.map_err(|error| IpcError::from_relay(&error, LOOKING_UP))?
    };
    Ok(keys
        .into_iter()
        .map(|key| status_of(key.code, &replies))
        .collect())
}

impl fmt::Debug for SentProblemReport {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("SentProblemReport")
            .field("code", &self.code)
            .finish_non_exhaustive()
    }
}

impl fmt::Debug for SentReportKey {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("SentReportKey")
            .field("code", &self.code)
            .finish_non_exhaustive()
    }
}

fn relay(app: &AppHandle) -> Result<tauri::State<'_, RelayClient>, RelayError> {
    app.try_state::<RelayClient>().ok_or(RelayError::NotStarted)
}

fn reply_address(typed: Option<&str>) -> Result<Option<ReplyAddress>, IpcError> {
    typed
        .map(str::trim)
        .filter(|address| !address.is_empty())
        .map(ReplyAddress::parse)
        .transpose()
        .map_err(|_| IpcError::reply_address_invalid())
}

fn outgoing(
    report: &ProblemReport,
    reply_to: Option<ReplyAddress>,
    status_key: StatusKey,
) -> Result<OutgoingReport, IpcError> {
    let code = report
        .code()
        .to_relay()
        .ok_or_else(|| IpcError::internal(&RelayError::CodeTooShort))?;
    Ok(OutgoingReport {
        code,
        platform: relay_platform(report.app().platform),
        version: report.app().version.clone(),
        report: report.to_string(),
        reply_to,
        status_key,
    })
}

fn relay_platform(platform: AppPlatform) -> Platform {
    match platform {
        AppPlatform::Android => Platform::Android,
        AppPlatform::Ios => Platform::Ios,
        AppPlatform::Macos => Platform::Macos,
        AppPlatform::Windows => Platform::Windows,
        AppPlatform::Linux => Platform::Linux,
    }
}

fn lookup_of(key: &SentReportKey) -> Option<StatusLookup> {
    Some(StatusLookup {
        code: key.code.to_relay()?.to_string(),
        status_key: StatusKey::parse(&key.status_key)?,
    })
}

fn status_of(code: ReportCode, replies: &[StatusReply]) -> ProblemReportStatus {
    let review = replies
        .iter()
        .find(|reply| reply.code == code.to_string())
        .map_or(ReportReview::Unknown, |reply| review_of(reply.status));
    ProblemReportStatus { code, review }
}

fn review_of(status: ReportStatus) -> ReportReview {
    match status {
        ReportStatus::Received => ReportReview::Received,
        ReportStatus::Reviewing => ReportReview::Reviewing,
        ReportStatus::Published { issue } => u32::try_from(issue)
            .map_or(ReportReview::Unknown, |issue| ReportReview::Published {
                issue,
            }),
        ReportStatus::Duplicate { issue } => u32::try_from(issue)
            .map_or(ReportReview::Unknown, |issue| ReportReview::Duplicate {
                issue,
            }),
        ReportStatus::Closed => ReportReview::Closed,
        ReportStatus::Unknown => ReportReview::Unknown,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn earlier_code() -> ReportCode {
        ReportCode::try_from("R-8M4T".to_owned()).unwrap()
    }

    fn wide_code() -> ReportCode {
        ReportCode::from_random([1, 2, 3, 4, 5])
    }

    fn key_for(code: ReportCode, status_key: &str) -> SentReportKey {
        SentReportKey {
            code,
            status_key: status_key.to_owned(),
        }
    }

    #[test]
    fn keeps_status_keys_out_of_debug_output() {
        let key = StatusKey::from_bytes([9; 32]).to_text();
        let sent = SentProblemReport {
            code: wide_code(),
            status_key: key.clone(),
        };

        let printed = [
            format!("{sent:?}"),
            format!("{:?}", key_for(wide_code(), &key)),
        ];

        assert!(
            printed.iter().all(|text| !text.contains(&key)),
            "{printed:?}"
        );
        assert!(
            printed
                .iter()
                .all(|text| text.contains(&wide_code().to_string()))
        );
    }

    #[test]
    fn sends_no_reply_address_when_only_spaces_were_typed() {
        let blank = reply_address(Some("   "));
        let none = reply_address(None);

        assert!(matches!(blank, Ok(None)));
        assert!(matches!(none, Ok(None)));
    }

    #[test]
    fn trims_the_reply_address_before_sending_it() {
        let address = reply_address(Some("  reader@example.com ")).unwrap();

        assert_eq!(
            address
                .map(|address| address.as_str().to_owned())
                .as_deref(),
            Some("reader@example.com")
        );
    }

    #[test]
    fn refuses_a_reply_address_without_an_at_before_sending() {
        let refused = reply_address(Some("reader.example.com"));

        assert_eq!(refused.unwrap_err(), IpcError::reply_address_invalid());
    }

    #[test]
    fn names_each_platform_the_way_the_relay_reads_it() {
        let platforms = [
            AppPlatform::Android,
            AppPlatform::Ios,
            AppPlatform::Macos,
            AppPlatform::Windows,
            AppPlatform::Linux,
        ]
        .map(|platform| relay_platform(platform).as_str());

        assert_eq!(platforms, ["android", "ios", "macos", "windows", "linux"]);
    }

    #[test]
    fn asks_only_about_full_width_codes_with_a_readable_key() {
        let key = StatusKey::from_bytes([3; 32]).to_text();

        let asked = [
            lookup_of(&key_for(wide_code(), &key)).is_some(),
            lookup_of(&key_for(earlier_code(), &key)).is_some(),
            lookup_of(&key_for(wide_code(), "not a key")).is_some(),
        ];

        assert_eq!(asked, [true, false, false]);
    }

    #[test]
    fn reads_the_review_the_relay_answered_for_each_code() {
        let replies = [StatusReply {
            code: wide_code().to_string(),
            status: ReportStatus::Published { issue: 412 },
        }];

        let answered = status_of(wide_code(), &replies);
        let unasked = status_of(earlier_code(), &replies);

        assert_eq!(answered.review, ReportReview::Published { issue: 412 });
        assert_eq!(unasked.review, ReportReview::Unknown);
    }

    #[test]
    fn reads_every_review_status() {
        let reviews = [
            ReportStatus::Received,
            ReportStatus::Reviewing,
            ReportStatus::Closed,
            ReportStatus::Unknown,
            ReportStatus::Published {
                issue: u64::from(u32::MAX) + 1,
            },
            ReportStatus::Duplicate { issue: 97 },
            ReportStatus::Duplicate {
                issue: u64::from(u32::MAX) + 1,
            },
        ]
        .map(review_of);

        assert_eq!(
            reviews,
            [
                ReportReview::Received,
                ReportReview::Reviewing,
                ReportReview::Closed,
                ReportReview::Unknown,
                ReportReview::Unknown,
                ReportReview::Duplicate { issue: 97 },
                ReportReview::Unknown,
            ]
        );
    }
}
