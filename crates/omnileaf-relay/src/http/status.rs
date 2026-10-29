use axum::{
    Json,
    extract::{Request, State},
};
use omnileaf_relay_proto::{StatusLookups, StatusReplies, limits::STATUS_LOOKUPS};

use super::{Failure, Relay, requester::Requester};
use crate::rate_limit::Action;

pub(super) async fn look_up(
    State(relay): State<Relay>,
    Requester(address): Requester,
    request: Request,
) -> Result<Json<StatusReplies>, Failure> {
    let lookups: StatusLookups = relay
        .read_admitted(address, Action::Status, request)
        .await?;
    if lookups.reports.is_empty() {
        return Err(Failure::BadRequest);
    }
    if lookups.reports.len() > STATUS_LOOKUPS {
        return Err(Failure::TooLarge);
    }
    let reports = relay
        .with_store(move |store| store.statuses(&lookups.reports))
        .await?;
    Ok(Json(StatusReplies { reports }))
}
