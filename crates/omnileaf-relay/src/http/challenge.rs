use axum::{Json, extract::State, http::StatusCode};
use omnileaf_relay_proto::{Challenge, ChallengeRequest};

use super::{Failure, Relay, json_body::JsonBody, requester::Requester};
use crate::{
    challenges::{CHALLENGE_LIFETIME_SECONDS, ChallengeIssue, ChallengeTerms},
    rate_limit::Action,
};

pub(super) async fn issue(
    State(relay): State<Relay>,
    Requester(address): Requester,
    JsonBody(ChallengeRequest {}): JsonBody<ChallengeRequest>,
) -> Result<(StatusCode, Json<Challenge>), Failure> {
    relay.admit(address, Action::Challenge).await?;
    let terms = ChallengeTerms {
        difficulty: relay.settings.difficulty,
        outstanding_limit: relay.settings.limits.outstanding_challenges,
    };
    let now = relay.clock.now();
    match relay
        .with_store(move |store| store.issue_challenge(terms, now))
        .await?
    {
        ChallengeIssue::Issued(challenge) => Ok((StatusCode::CREATED, Json(challenge))),
        ChallengeIssue::TooManyOutstanding => Err(Failure::RelayBusy {
            retry_after_seconds: CHALLENGE_LIFETIME_SECONDS.unsigned_abs(),
        }),
    }
}
