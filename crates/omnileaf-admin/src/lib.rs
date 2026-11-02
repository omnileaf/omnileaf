mod auth;
mod config;
mod github;
mod page;
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
        Ok(Self {
            keys: sealed::Keys::new(&config.session_key)?,
            github: Arc::new(github::GitHub::new(github::http_client()?, config)),
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
        .route("/admin", get(auth::home))
        .route("/admin/login", get(auth::login))
        .route("/admin/auth/callback", get(auth::callback))
        .route("/admin/logout", post(auth::logout))
        .layer(map_response(|response| async { page::hardened(response) }))
        .with_state(state)
}
