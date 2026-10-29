mod challenge;
mod failure;
mod json_body;
mod report;
mod requester;
mod status;

use std::{sync::Arc, time::Duration};

use axum::{
    Json, Router,
    extract::DefaultBodyLimit,
    http::StatusCode,
    routing::{get, post},
};
use omnileaf_relay_proto::{limits::REQUEST_BODY_BYTES, pow::Difficulty};
use serde_json::{Value, json};
use tower_http::timeout::TimeoutLayer;

pub use failure::Failure;

use crate::{
    client_ip::{ClientAddress, ClientIpSource},
    clock::Clock,
    rate_limit::{Action, Admission, Attempt, Limits},
    store::{Store, StoreError},
};

const REQUEST_TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Clone, Copy, Debug)]
pub struct Settings {
    pub difficulty: Difficulty,
    pub limits: Limits,
    pub client_ip: ClientIpSource,
}

#[derive(Clone)]
pub struct Relay {
    store: Arc<Store>,
    clock: Arc<dyn Clock>,
    settings: Settings,
}

impl Relay {
    #[must_use]
    pub fn new(store: Arc<Store>, clock: Arc<dyn Clock>, settings: Settings) -> Self {
        Self {
            store,
            clock,
            settings,
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

    async fn admit(&self, address: ClientAddress, action: Action) -> Result<(), Failure> {
        let limit = self.settings.limits.for_action(action);
        let at = self.clock.now();
        let admission = self
            .with_store(move |store| {
                store.admit(
                    Attempt {
                        address: &address,
                        action,
                        at,
                    },
                    limit,
                )
            })
            .await?;
        match admission {
            Admission::Admitted => Ok(()),
            Admission::Limited {
                retry_after_seconds,
            } => Err(Failure::RateLimited {
                retry_after_seconds,
            }),
        }
    }
}

pub fn router(relay: Relay) -> Router {
    Router::new()
        .route("/relay/v1/health", get(health))
        .route("/relay/v1/challenges", post(challenge::issue))
        .route("/relay/v1/reports", post(report::take_in))
        .route("/relay/v1/reports/statuses", post(status::look_up))
        .layer(DefaultBodyLimit::max(REQUEST_BODY_BYTES))
        .layer(TimeoutLayer::with_status_code(
            StatusCode::REQUEST_TIMEOUT,
            REQUEST_TIMEOUT,
        ))
        .with_state(relay)
}

async fn health() -> Json<Value> {
    Json(json!({ "ok": true }))
}
