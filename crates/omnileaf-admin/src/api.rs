use axum::{
    Json, Router,
    extract::{
        FromRequestParts, Path, State,
        rejection::{JsonRejection, PathRejection},
    },
    http::{HeaderMap, StatusCode, request::Parts},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use omnileaf_relay_proto::ReportCode;
use serde::{Deserialize, Serialize};

use crate::{
    AppState,
    auth::{Session, clear_session_cookie},
    relay::{AuditEntry, Export, LIST_LIMIT, Listed, RelayError, StatusChange},
};

const CSRF_HEADER: &str = "x-csrf-token";

#[derive(Serialize)]
#[serde(tag = "error", rename_all = "camelCase")]
enum ApiError {
    SignedOut,
    CsrfRejected,
    NotFound,
    MethodNotAllowed,
    BadRequest,
    IssueRequired,
    Refused { from: String },
    RelayUnavailable,
}

impl From<RelayError> for ApiError {
    fn from(_: RelayError) -> Self {
        Self::RelayUnavailable
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let status = match self {
            Self::SignedOut => StatusCode::UNAUTHORIZED,
            Self::CsrfRejected => StatusCode::FORBIDDEN,
            Self::NotFound => StatusCode::NOT_FOUND,
            Self::MethodNotAllowed => StatusCode::METHOD_NOT_ALLOWED,
            Self::BadRequest | Self::IssueRequired => StatusCode::BAD_REQUEST,
            Self::Refused { .. } => StatusCode::CONFLICT,
            Self::RelayUnavailable => StatusCode::BAD_GATEWAY,
        };
        (status, Json(self)).into_response()
    }
}

struct ApiSession(Session);

impl ApiSession {
    fn with_csrf(self, state: &AppState, headers: &HeaderMap) -> Result<Session, ApiError> {
        headers
            .get(CSRF_HEADER)
            .and_then(|token| token.to_str().ok())
            .is_some_and(|token| self.0.csrf_matches(state, token))
            .then_some(self.0)
            .ok_or(ApiError::CsrfRejected)
    }
}

impl FromRequestParts<AppState> for ApiSession {
    type Rejection = ApiError;

    fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> impl Future<Output = Result<Self, Self::Rejection>> {
        std::future::ready(
            Session::from_headers(&parts.headers, state)
                .map(Self)
                .ok_or(ApiError::SignedOut),
        )
    }
}

#[derive(Serialize)]
struct SessionBody {
    login: String,
    csrf: String,
}

#[derive(Serialize)]
struct ReportsBody {
    reports: Vec<Listed>,
    truncated: bool,
}

#[derive(Serialize)]
struct ReportBody {
    listed: Listed,
    report: Option<String>,
    audit: Vec<AuditEntry>,
}

#[derive(Serialize)]
#[serde(tag = "result", rename_all = "camelCase")]
enum IssueBody {
    Ready { body: String },
    Purged,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
enum Move {
    Reviewing,
    Published,
    Duplicate,
    Closed,
}

impl Move {
    fn name(&self) -> &'static str {
        match self {
            Self::Reviewing => "reviewing",
            Self::Published => "published",
            Self::Duplicate => "duplicate",
            Self::Closed => "closed",
        }
    }

    fn needs_issue(&self) -> bool {
        matches!(self, Self::Published | Self::Duplicate)
    }
}

#[derive(Deserialize)]
struct MoveRequest {
    status: Move,
    issue: Option<u64>,
}

#[derive(Serialize)]
#[serde(tag = "result", rename_all = "camelCase")]
enum MoveBody {
    Changed,
}

pub(crate) fn router() -> Router<AppState> {
    Router::new()
        .route("/session", get(session))
        .route("/reports", get(reports))
        .route("/reports/{code}", get(report))
        .route("/reports/{code}/issue", get(issue))
        .route("/reports/{code}/status", post(change_status))
        .route("/logout", post(logout))
        .fallback(not_found)
        .method_not_allowed_fallback(|| async { ApiError::MethodNotAllowed })
}

fn code_of(path: Result<Path<String>, PathRejection>) -> Result<ReportCode, ApiError> {
    let Path(text) = path.map_err(|_| ApiError::NotFound)?;
    ReportCode::try_from(text).map_err(|_| ApiError::NotFound)
}

pub(crate) async fn not_found() -> Response {
    ApiError::NotFound.into_response()
}

async fn session(
    State(state): State<AppState>,
    ApiSession(session): ApiSession,
) -> Json<SessionBody> {
    Json(SessionBody {
        csrf: session.csrf_token(&state),
        login: session.login,
    })
}

async fn reports(
    State(state): State<AppState>,
    _session: ApiSession,
) -> Result<Json<ReportsBody>, ApiError> {
    let reports = state.relay.list(None).await?;
    Ok(Json(ReportsBody {
        truncated: reports.len() >= LIST_LIMIT,
        reports,
    }))
}

async fn report(
    State(state): State<AppState>,
    _session: ApiSession,
    code: Result<Path<String>, PathRejection>,
) -> Result<Json<ReportBody>, ApiError> {
    let code = code_of(code)?;
    let detail = state.relay.detail(&code).await?.ok_or(ApiError::NotFound)?;
    let audit = state.relay.audit(&code).await?;
    Ok(Json(ReportBody {
        listed: detail.listed,
        report: detail.report,
        audit,
    }))
}

async fn issue(
    State(state): State<AppState>,
    _session: ApiSession,
    code: Result<Path<String>, PathRejection>,
) -> Result<Json<IssueBody>, ApiError> {
    let code = code_of(code)?;
    match state.relay.export(&code).await? {
        Export::Ready(body) => Ok(Json(IssueBody::Ready { body })),
        Export::Purged => Ok(Json(IssueBody::Purged)),
        Export::NotFound => Err(ApiError::NotFound),
    }
}

async fn change_status(
    State(state): State<AppState>,
    session: ApiSession,
    headers: HeaderMap,
    code: Result<Path<String>, PathRejection>,
    request: Result<Json<MoveRequest>, JsonRejection>,
) -> Result<Json<MoveBody>, ApiError> {
    let session = session.with_csrf(&state, &headers)?;
    let code = code_of(code)?;
    let Json(MoveRequest { status, issue }) = request.map_err(|_| ApiError::BadRequest)?;
    let issue = if status.needs_issue() {
        Some(
            issue
                .filter(|number| *number > 0)
                .ok_or(ApiError::IssueRequired)?,
        )
    } else {
        None
    };
    match state
        .relay
        .change_status(&code, status.name(), issue, &session.login)
        .await?
    {
        StatusChange::Changed => Ok(Json(MoveBody::Changed)),
        StatusChange::NotFound => Err(ApiError::NotFound),
        StatusChange::Refused { from } => Err(ApiError::Refused { from }),
    }
}

async fn logout(
    State(state): State<AppState>,
    session: ApiSession,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    session.with_csrf(&state, &headers)?;
    let mut response = StatusCode::NO_CONTENT.into_response();
    clear_session_cookie(&mut response);
    Ok(response)
}
