use axum::{
    Json, Router,
    extract::{FromRequestParts, State},
    http::{StatusCode, request::Parts},
    response::{IntoResponse, Response},
    routing::get,
};
use serde::Serialize;

use crate::{
    AppState,
    auth::Session,
    relay::{LIST_LIMIT, Listed, RelayError},
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

pub(crate) fn router() -> Router<AppState> {
    Router::new()
        .route("/session", get(session))
        .route("/reports", get(reports))
        .fallback(not_found)
        .method_not_allowed_fallback(|| async { ApiError::MethodNotAllowed })
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
