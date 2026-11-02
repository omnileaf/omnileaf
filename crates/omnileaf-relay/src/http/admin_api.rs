use std::sync::Arc;

use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, Path, Query, Request, State},
    http::{HeaderMap, StatusCode, header::AUTHORIZATION},
    middleware::{Next, from_fn_with_state},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use omnileaf_relay_proto::ReportCode;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use super::{Failure, json_body::JsonBody};
use crate::{
    admin::{AuditEntry, Export, ListedReport, ReplyAddressView, ShownReport, StatusChange},
    clock::Clock,
    status::{IssueNumber, ReviewStatus, StatusKind, TargetStatus},
    store::{Store, StoreError},
};

const ACTOR_HEADER: &str = "x-admin-actor";
const BEARER_PREFIX: &str = "Bearer ";
const MIN_TOKEN_BYTES: usize = 32;
const DEFAULT_LIST_LIMIT: u32 = 50;
const MAX_LIST_LIMIT: u32 = 500;
const STATUS_BODY_BYTES: usize = 1024;

#[derive(Debug, PartialEq, Eq, thiserror::Error)]
#[error("the admin token must be at least {MIN_TOKEN_BYTES} bytes")]
pub struct AdminTokenTooShort;

#[derive(Clone)]
pub struct AdminToken(blake3::Hash);

impl AdminToken {
    pub fn new(token: &str) -> Result<Self, AdminTokenTooShort> {
        if token.len() < MIN_TOKEN_BYTES {
            return Err(AdminTokenTooShort);
        }
        Ok(Self(blake3::hash(token.as_bytes())))
    }

    /// Compares hashes, because `blake3::Hash` equality runs in constant time.
    fn accepts(&self, presented: &str) -> bool {
        blake3::hash(presented.as_bytes()) == self.0
    }
}

#[derive(Clone)]
pub struct AdminApi {
    store: Arc<Store>,
    clock: Arc<dyn Clock>,
    token: AdminToken,
}

impl AdminApi {
    #[must_use]
    pub fn new(store: Arc<Store>, clock: Arc<dyn Clock>, token: AdminToken) -> Self {
        Self {
            store,
            clock,
            token,
        }
    }

    async fn with_store<T: Send + 'static>(
        &self,
        work: impl FnOnce(&Store) -> Result<T, StoreError> + Send + 'static,
    ) -> Result<T, Failure> {
        let store = Arc::clone(&self.store);
        tokio::task::spawn_blocking(move || work(&store))
            .await
            .map_err(|error| Failure::internal(&error))?
            .map_err(|error| Failure::internal(&error))
    }
}

pub fn admin_router(api: AdminApi) -> Router {
    Router::new()
        .route("/admin/v1/reports", get(list))
        .route("/admin/v1/reports/{code}", get(show))
        .route("/admin/v1/reports/{code}/status", post(set_status))
        .route("/admin/v1/reports/{code}/export", get(export))
        .route("/admin/v1/reports/{code}/audit", get(audit))
        .layer(DefaultBodyLimit::max(STATUS_BODY_BYTES))
        .layer(from_fn_with_state(api.clone(), require_token))
        .with_state(api)
}

async fn require_token(State(api): State<AdminApi>, request: Request, next: Next) -> Response {
    let presented = request
        .headers()
        .get(AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix(BEARER_PREFIX));
    if presented.is_some_and(|token| api.token.accepts(token)) {
        next.run(request).await
    } else {
        StatusCode::UNAUTHORIZED.into_response()
    }
}

#[derive(Serialize)]
struct StatusView {
    kind: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    issue: Option<u64>,
}

impl From<ReviewStatus> for StatusView {
    fn from(status: ReviewStatus) -> Self {
        Self {
            kind: status.kind().as_str(),
            issue: status.issue().map(IssueNumber::get),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ListedView {
    code: String,
    received_at: i64,
    status: StatusView,
    platform: String,
    version: String,
}

impl From<ListedReport> for ListedView {
    fn from(listed: ListedReport) -> Self {
        Self {
            code: listed.code,
            received_at: listed.received_at.seconds(),
            status: listed.status.into(),
            platform: listed.platform,
            version: listed.version,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ShownView {
    listed: ListedView,
    report: Option<String>,
    reply_address: Option<String>,
}

#[derive(Serialize)]
struct AuditView {
    previous: &'static str,
    status: StatusView,
    actor: String,
    at: i64,
}

impl From<AuditEntry> for AuditView {
    fn from(entry: AuditEntry) -> Self {
        Self {
            previous: entry.previous.as_str(),
            status: entry.status.into(),
            actor: entry.actor,
            at: entry.at.seconds(),
        }
    }
}

#[derive(Deserialize)]
struct ListQuery {
    status: Option<String>,
    limit: Option<u32>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ShowQuery {
    #[serde(default)]
    reply_address: bool,
}

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
enum TargetName {
    Reviewing,
    Published,
    Duplicate,
    Closed,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct StatusRequest {
    status: TargetName,
    issue: Option<u64>,
}

impl StatusRequest {
    fn target(&self) -> Option<TargetStatus> {
        let issue = self.issue.map(IssueNumber::new);
        match (self.status, issue) {
            (TargetName::Published, Some(Some(issue))) => Some(TargetStatus::Published(issue)),
            (TargetName::Duplicate, Some(Some(issue))) => Some(TargetStatus::Duplicate(issue)),
            (TargetName::Reviewing, None) => Some(TargetStatus::Reviewing),
            (TargetName::Closed, None) => Some(TargetStatus::Closed),
            _ => None,
        }
    }
}

fn parse_code(code: String) -> Result<ReportCode, Failure> {
    ReportCode::try_from(code).map_err(|_| Failure::InvalidCode)
}

async fn list(
    State(api): State<AdminApi>,
    Query(query): Query<ListQuery>,
) -> Result<Json<Vec<ListedView>>, Failure> {
    let filter = query
        .status
        .map(|text| StatusKind::from_text(&text).ok_or(Failure::BadRequest))
        .transpose()?;
    let limit = query
        .limit
        .unwrap_or(DEFAULT_LIST_LIMIT)
        .min(MAX_LIST_LIMIT);
    let listed = api
        .with_store(move |store| store.list(filter, limit))
        .await?;
    Ok(Json(listed.into_iter().map(ListedView::from).collect()))
}

async fn show(
    State(api): State<AdminApi>,
    Path(code): Path<String>,
    Query(query): Query<ShowQuery>,
) -> Result<Response, Failure> {
    let code = parse_code(code)?;
    let view = if query.reply_address {
        ReplyAddressView::Shown
    } else {
        ReplyAddressView::Hidden
    };
    let shown = api.with_store(move |store| store.show(&code, view)).await?;
    let Some(ShownReport {
        listed,
        report,
        reply_address,
    }) = shown
    else {
        return Ok(StatusCode::NOT_FOUND.into_response());
    };
    Ok(Json(ShownView {
        listed: listed.into(),
        report,
        reply_address,
    })
    .into_response())
}

async fn set_status(
    State(api): State<AdminApi>,
    Path(code): Path<String>,
    headers: HeaderMap,
    JsonBody(request): JsonBody<StatusRequest>,
) -> Result<Json<Value>, Failure> {
    let code = parse_code(code)?;
    let actor = headers
        .get(ACTOR_HEADER)
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|actor| !actor.is_empty())
        .ok_or(Failure::BadRequest)?
        .to_owned();
    let target = request.target().ok_or(Failure::BadRequest)?;
    let now = api.clock.now();
    let change = api
        .with_store(move |store| store.set_status(&code, target, &actor, now))
        .await?;
    Ok(Json(match change {
        StatusChange::Changed => json!({ "result": "changed" }),
        StatusChange::NotFound => json!({ "result": "notFound" }),
        StatusChange::Refused { from } => {
            json!({ "result": "refused", "from": from.kind().as_str() })
        }
    }))
}

async fn export(
    State(api): State<AdminApi>,
    Path(code): Path<String>,
) -> Result<Json<Value>, Failure> {
    let code = parse_code(code)?;
    let exported = api.with_store(move |store| store.export(&code)).await?;
    Ok(Json(match exported {
        Export::Ready(body) => json!({ "result": "ready", "body": body }),
        Export::NotFound => json!({ "result": "notFound" }),
        Export::Purged => json!({ "result": "purged" }),
    }))
}

async fn audit(
    State(api): State<AdminApi>,
    Path(code): Path<String>,
) -> Result<Json<Vec<AuditView>>, Failure> {
    let code = parse_code(code)?;
    let trail = api
        .with_store(move |store| store.audit_trail(&code))
        .await?;
    Ok(Json(trail.into_iter().map(AuditView::from).collect()))
}
