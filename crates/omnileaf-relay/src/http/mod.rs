mod challenge;
mod failure;
mod json_body;
mod report;
mod requester;
mod status;

use std::{sync::Arc, time::Duration};

use axum::{
    Json, Router,
    error_handling::HandleErrorLayer,
    extract::{DefaultBodyLimit, FromRequest, Request},
    routing::{get, post},
};
use omnileaf_relay_proto::{limits::REQUEST_BODY_BYTES, pow::Difficulty};
use serde::de::DeserializeOwned;
use serde_json::{Value, json};
use tower::{
    BoxError, ServiceBuilder, limit::GlobalConcurrencyLimitLayer, load_shed::error::Overloaded,
    timeout::error::Elapsed,
};

pub use failure::Failure;
use json_body::JsonBody;

use crate::{
    client_ip::{ClientAddress, ClientIpSource},
    clock::Clock,
    rate_limit::{Action, Admission, Attempt, Limits},
    store::{Store, StoreError},
};

const REQUEST_TIMEOUT: Duration = Duration::from_secs(15);
const RETRY_WHEN_BUSY_SECONDS: u64 = 30;

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

    async fn read_admitted<T: DeserializeOwned>(
        &self,
        address: ClientAddress,
        action: Action,
        request: Request,
    ) -> Result<T, Failure> {
        self.admit(address, action).await?;
        let JsonBody(body) = JsonBody::from_request(request, &()).await?;
        Ok(body)
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
        .layer(
            ServiceBuilder::new()
                .layer(HandleErrorLayer::new(answer_unserved))
                .load_shed()
                .layer(GlobalConcurrencyLimitLayer::new(
                    relay.settings.limits.concurrent_requests,
                ))
                .timeout(REQUEST_TIMEOUT),
        )
        .with_state(relay)
}

async fn answer_unserved(error: BoxError) -> Failure {
    unserved(&*error)
}

fn unserved(error: &(dyn std::error::Error + Send + Sync + 'static)) -> Failure {
    if error.is::<Elapsed>() || error.is::<Overloaded>() {
        Failure::RelayBusy {
            retry_after_seconds: RETRY_WHEN_BUSY_SECONDS,
        }
    } else {
        Failure::internal(error)
    }
}

async fn health() -> Json<Value> {
    Json(json!({ "ok": true }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn answers_a_request_that_ran_out_of_time_as_busy() {
        let failure = unserved(&Elapsed::new());

        assert!(matches!(failure, Failure::RelayBusy { .. }));
    }

    #[test]
    fn answers_a_shed_request_as_busy() {
        let failure = unserved(&Overloaded::new());

        assert!(matches!(failure, Failure::RelayBusy { .. }));
    }
}
