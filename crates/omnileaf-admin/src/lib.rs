mod auth;
mod clock_text;
mod config;
mod github;
mod moves;
mod page;
mod relay;
mod review;
mod sealed;

use std::{collections::HashSet, sync::Arc};

use axum::{
    Router,
    middleware::map_response,
    routing::{get, post},
};

pub use config::Config;
pub use sealed::KeyTooShort;

pub type Clock = Arc<dyn Fn() -> u64 + Send + Sync>;

#[derive(Clone)]
pub struct AppState {
    keys: sealed::Keys,
    github: Arc<github::GitHub>,
    relay: Arc<relay::Relay>,
    allowlist: Arc<HashSet<String>>,
    clock: Clock,
}

impl AppState {
    pub fn new(config: &Config, clock: Clock) -> anyhow::Result<Self> {
        let allowlist = config
            .admin_allowlist
            .iter()
            .map(|login| login.trim().to_ascii_lowercase())
            .filter(|login| !login.is_empty())
            .collect();
        let http = github::http_client()?;
        Ok(Self {
            keys: sealed::Keys::new(&config.session_key)?,
            github: Arc::new(github::GitHub::new(http.clone(), config)),
            relay: Arc::new(relay::Relay::new(
                http,
                &config.relay_url,
                &config.relay_token,
            )),
            allowlist: Arc::new(allowlist),
            clock,
        })
    }

    pub(crate) fn now(&self) -> u64 {
        (self.clock)()
    }
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/admin/health", get(|| async {}))
        .route("/admin", get(review::list))
        .route("/admin/style.css", get(|| async { page::stylesheet() }))
        .route("/admin/reports/{code}", get(review::detail))
        .route("/admin/reports/{code}/audit", get(review::audit))
        .route("/admin/reports/{code}/issue", get(moves::public_issue))
        .route("/admin/reports/{code}/status", post(moves::change_status))
        .route("/admin/login", get(auth::login))
        .route("/admin/auth/callback", get(auth::callback))
        .route("/admin/logout", post(auth::logout))
        .layer(map_response(|response| async { page::hardened(response) }))
        .with_state(state)
}
