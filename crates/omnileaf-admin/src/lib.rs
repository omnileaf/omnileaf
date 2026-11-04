mod api;
mod assets;
mod auth;
mod config;
mod github;
mod page;
mod relay;
mod sealed;

use std::{collections::HashSet, sync::Arc};

use anyhow::Context;
use axum::{
    Router,
    middleware::map_response,
    routing::{any, get},
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
    assets: Option<Arc<assets::Assets>>,
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
        if config.static_dir.is_none() {
            tracing::warn!("ADMIN_STATIC_DIR is not set, so every page answers 404");
        }
        let assets = config
            .static_dir
            .as_deref()
            .map(|directory| {
                assets::Assets::load(directory)
                    .map(Arc::new)
                    .context("load ADMIN_STATIC_DIR")
            })
            .transpose()?;
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
            assets,
        })
    }

    pub(crate) fn now(&self) -> u64 {
        (self.clock)()
    }
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/admin/health", get(|| async {}))
        .route("/admin/api/", any(api::not_found))
        .nest("/admin/api", api::router())
        .route("/admin/style.css", get(|| async { page::stylesheet() }))
        .route("/admin/login", get(auth::login))
        .route("/admin/auth/callback", get(auth::callback))
        .fallback(get(assets::serve))
        .layer(map_response(|response| async { page::hardened(response) }))
        .with_state(state)
}
