use axum::{
    body::Bytes,
    extract::{FromRequest, Request},
    http::{StatusCode, header::CONTENT_TYPE},
};
use serde::de::DeserializeOwned;

use super::Failure;

const JSON_MEDIA_TYPE: &str = "application/json";

pub(crate) struct JsonBody<T>(pub(crate) T);

impl<T: DeserializeOwned, S: Send + Sync> FromRequest<S> for JsonBody<T> {
    type Rejection = Failure;

    async fn from_request(request: Request, state: &S) -> Result<Self, Self::Rejection> {
        if !is_json(&request) {
            return Err(Failure::UnsupportedMediaType);
        }
        let bytes =
            Bytes::from_request(request, state)
                .await
                .map_err(|rejection| match rejection.status() {
                    StatusCode::PAYLOAD_TOO_LARGE => Failure::TooLarge,
                    _ => Failure::BadRequest,
                })?;
        serde_json::from_slice(&bytes)
            .map(Self)
            .map_err(|_| Failure::BadRequest)
    }
}

fn is_json(request: &Request) -> bool {
    request
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(';').next())
        .is_some_and(|media_type| media_type.trim().eq_ignore_ascii_case(JSON_MEDIA_TYPE))
}
