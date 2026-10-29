use std::error::Error;

use axum::{
    Json,
    http::{HeaderValue, StatusCode, header::RETRY_AFTER},
    response::{IntoResponse, Response},
};
use omnileaf_relay_proto::{ErrorBody, ErrorCode, ErrorDetail};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Failure {
    BadRequest,
    UnsupportedMediaType,
    TooLarge,
    InvalidCode,
    InvalidReplyAddress,
    ChallengeUnknown,
    ProofRejected,
    CodeTaken,
    RateLimited { retry_after_seconds: u64 },
    RelayBusy { retry_after_seconds: u64 },
    Internal,
}

impl Failure {
    pub(crate) fn internal(error: &dyn Error) -> Self {
        tracing::error!(error = %describe(error), "relay request failed");
        Self::Internal
    }

    fn parts(self) -> (StatusCode, ErrorCode, &'static str, Option<u64>) {
        match self {
            Self::BadRequest => (
                StatusCode::BAD_REQUEST,
                ErrorCode::BadRequest,
                "The request isn't valid.",
                None,
            ),
            Self::UnsupportedMediaType => (
                StatusCode::UNSUPPORTED_MEDIA_TYPE,
                ErrorCode::UnsupportedMediaType,
                "The request must be JSON.",
                None,
            ),
            Self::TooLarge => (
                StatusCode::PAYLOAD_TOO_LARGE,
                ErrorCode::TooLarge,
                "The report is too large.",
                None,
            ),
            Self::InvalidCode => (
                StatusCode::UNPROCESSABLE_ENTITY,
                ErrorCode::InvalidCode,
                "The report code isn't valid.",
                None,
            ),
            Self::InvalidReplyAddress => (
                StatusCode::UNPROCESSABLE_ENTITY,
                ErrorCode::InvalidReplyAddress,
                "The reply address isn't valid.",
                None,
            ),
            Self::ChallengeUnknown => (
                StatusCode::CONFLICT,
                ErrorCode::ChallengeUnknown,
                "The challenge expired or was already used.",
                None,
            ),
            Self::ProofRejected => (
                StatusCode::UNPROCESSABLE_ENTITY,
                ErrorCode::ProofRejected,
                "The proof of work doesn't match the report.",
                None,
            ),
            Self::CodeTaken => (
                StatusCode::CONFLICT,
                ErrorCode::CodeTaken,
                "Another report has this code.",
                None,
            ),
            Self::RateLimited {
                retry_after_seconds,
            } => (
                StatusCode::TOO_MANY_REQUESTS,
                ErrorCode::RateLimited,
                "Too many requests from this network.",
                Some(retry_after_seconds),
            ),
            Self::RelayBusy {
                retry_after_seconds,
            } => (
                StatusCode::SERVICE_UNAVAILABLE,
                ErrorCode::RelayBusy,
                "The relay is taking no more reports for now.",
                Some(retry_after_seconds),
            ),
            Self::Internal => (
                StatusCode::INTERNAL_SERVER_ERROR,
                ErrorCode::Internal,
                "Something went wrong in the relay.",
                None,
            ),
        }
    }
}

impl IntoResponse for Failure {
    fn into_response(self) -> Response {
        let (status, code, message, retry_after) = self.parts();
        let body = ErrorBody {
            error: ErrorDetail {
                code,
                message: message.to_owned(),
            },
        };
        let mut response = (status, Json(body)).into_response();
        if let Some(seconds) = retry_after {
            response
                .headers_mut()
                .insert(RETRY_AFTER, HeaderValue::from(seconds));
        }
        response
    }
}

fn describe(error: &dyn Error) -> String {
    let mut text = error.to_string();
    let mut source = error.source();
    while let Some(cause) = source {
        text.push_str(": ");
        text.push_str(&cause.to_string());
        source = cause.source();
    }
    text
}
