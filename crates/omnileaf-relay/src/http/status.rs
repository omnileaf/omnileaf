use axum::{Json, extract::State};
use omnileaf_relay_proto::{StatusLookups, StatusReplies, limits::STATUS_LOOKUPS};

use super::{Failure, Relay, json_body::JsonBody, requester::Requester};
use crate::rate_limit::Action;

pub(super) async fn look_up(
    State(relay): State<Relay>,
    Requester(address): Requester,
    JsonBody(lookups): JsonBody<StatusLookups>,
) -> Result<Json<StatusReplies>, Failure> {
    if lookups.reports.is_empty() {
        return Err(Failure::BadRequest);
    }
    if lookups.reports.len() > STATUS_LOOKUPS {
        return Err(Failure::TooLarge);
    }
    relay.admit(address, Action::Status).await?;
    let reports = relay
        .with_store(move |store| store.statuses(&lookups.reports))
        .await?;
    Ok(Json(StatusReplies { reports }))
}
