use axum::{
    Json, Router,
    extract::{FromRequestParts, Path, State, rejection::PathRejection},
    http::{StatusCode, request::Parts},
    response::{IntoResponse, Response},
    routing::get,
};
use omnileaf_relay_proto::ReportCode;
use serde::Serialize;

use crate::{
    AppState,
    auth::Session,
    relay::{AuditEntry, Export, LIST_LIMIT, Listed, RelayError},
};

#[derive(Serialize)]
#[serde(tag = "error", rename_all = "camelCase")]
enum ApiError {
    SignedOut,
    NotFound,
    MethodNotAllowed,
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
            Self::NotFound => StatusCode::NOT_FOUND,
            Self::MethodNotAllowed => StatusCode::METHOD_NOT_ALLOWED,
            Self::RelayUnavailable => StatusCode::BAD_GATEWAY,
        };
        (status, Json(self)).into_response()
    }
}

struct ApiSession(Session);

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

pub(crate) fn router() -> Router<AppState> {
    Router::new()
        .route("/session", get(session))
        .route("/reports", get(reports))
        .route("/reports/{code}", get(report))
        .route("/reports/{code}/issue", get(issue))
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
