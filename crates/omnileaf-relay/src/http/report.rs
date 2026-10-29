use axum::{Json, extract::State, http::StatusCode};
use omnileaf_relay_proto::{
    ReplyAddress, ReportCode, ReportReceipt, ReportStatus, ReportSubmission,
    limits::{REPORT_BYTES, REPORT_LINES, VERSION_BYTES},
    pow::{Puzzle, ReportContent},
};

use super::{Failure, Relay, json_body::JsonBody, requester::Requester};
use crate::{
    clock::{SECONDS_PER_HOUR, UnixTime},
    rate_limit::Action,
    reports::{Intake, IntakeCaps, NewReport},
};

const CODE_LABEL: &str = "Report code: ";

pub(super) async fn take_in(
    State(relay): State<Relay>,
    Requester(address): Requester,
    JsonBody(submission): JsonBody<ReportSubmission>,
) -> Result<(StatusCode, Json<ReportReceipt>), Failure> {
    let now = relay.clock.now();
    let challenge = submission.proof.challenge;
    let nonce = submission.proof.nonce;
    let report = checked(submission, now)?;
    relay.admit(address, Action::Report).await?;
    let receipt = Json(ReportReceipt {
        code: report.code.clone(),
        status: ReportStatus::Received,
    });
    let candidate = report.clone();
    if relay
        .with_store(move |store| store.is_already_received(&candidate))
        .await?
    {
        return Ok((StatusCode::OK, receipt));
    }
    let difficulty = relay
        .with_store(move |store| store.take_challenge(&challenge, now))
        .await?
        .ok_or(Failure::ChallengeUnknown)?;
    let puzzle = Puzzle {
        challenge: &challenge,
        subject: &report.body_hash,
        difficulty,
    };
    if !puzzle.is_solved_by(nonce) {
        return Err(Failure::ProofRejected);
    }
    let caps = IntakeCaps {
        reports_per_day: relay.settings.limits.reports_per_day,
        pending_reports: relay.settings.limits.pending_reports,
    };
    let code = report.code.clone();
    match relay
        .with_store(move |store| store.take_in(&report, caps))
        .await?
    {
        Intake::Inserted => {
            tracing::info!(code = %code, "report received");
            Ok((StatusCode::CREATED, receipt))
        }
        Intake::AlreadyReceived => Ok((StatusCode::OK, receipt)),
        Intake::CodeTaken => Err(Failure::CodeTaken),
        Intake::DailyCapReached => Err(Failure::RelayBusy {
            retry_after_seconds: now.seconds_to_next_day(),
        }),
        Intake::PendingCapReached => Err(Failure::RelayBusy {
            retry_after_seconds: SECONDS_PER_HOUR.unsigned_abs(),
        }),
    }
}

fn checked(submission: ReportSubmission, now: UnixTime) -> Result<NewReport, Failure> {
    let code = ReportCode::try_from(submission.code).map_err(|_| Failure::InvalidCode)?;
    if submission.version.len() > VERSION_BYTES
        || submission.report.len() > REPORT_BYTES
        || submission.report.lines().count() > REPORT_LINES
    {
        return Err(Failure::TooLarge);
    }
    if !opens_with_code(&submission.report, &code) {
        return Err(Failure::BadRequest);
    }
    let reply_to = submission
        .reply_to
        .as_deref()
        .map(ReplyAddress::parse)
        .transpose()
        .map_err(|_| Failure::InvalidReplyAddress)?;
    let body_hash = ReportContent {
        code: &code,
        platform: submission.platform,
        version: &submission.version,
        report: &submission.report,
        reply_to: submission.reply_to.as_deref(),
        status_key_hash: &submission.status_key_hash,
    }
    .subject();
    Ok(NewReport {
        code,
        status_key_hash: submission.status_key_hash,
        body_hash,
        platform: submission.platform,
        version: submission.version,
        report: submission.report,
        reply_to,
        received_at: now,
    })
}

fn opens_with_code(report: &str, code: &ReportCode) -> bool {
    report
        .lines()
        .next()
        .and_then(|first| first.strip_prefix(CODE_LABEL))
        .is_some_and(|written| written == code.as_str())
}
