use std::{net::SocketAddr, path::PathBuf};

use clap::Parser;

/// Settings for the review dashboard, each read from an environment variable.
#[derive(Clone, Parser)]
#[command(name = "omnileaf-admin", version)]
pub struct Config {
    #[arg(long, env = "GITHUB_CLIENT_ID")]
    pub github_client_id: String,
    #[arg(long, env = "GITHUB_CLIENT_SECRET", hide_env_values = true)]
    pub github_client_secret: String,
    #[arg(long, env = "GITHUB_ORG")]
    pub github_org: String,
    #[arg(long, env = "GITHUB_TEAM")]
    pub github_team: String,
    /// Logins let in without being on the team, separated by commas.
    #[arg(
        long,
        env = "ADMIN_ALLOWLIST",
        value_delimiter = ',',
        default_value = ""
    )]
    pub admin_allowlist: Vec<String>,
    /// At least 32 characters; signs session and CSRF cookies.
    #[arg(long, env = "ADMIN_SESSION_KEY", hide_env_values = true)]
    pub session_key: String,
    #[arg(long, env = "ADMIN_RELAY_URL")]
    pub relay_url: String,
    #[arg(long, env = "ADMIN_RELAY_TOKEN", hide_env_values = true)]
    pub relay_token: String,
    #[arg(long, env = "ADMIN_LISTEN", default_value = "0.0.0.0:8080")]
    pub listen: SocketAddr,
    /// The built interface to serve to signed-in visitors; nothing is served when it is not set.
    #[arg(long, env = "ADMIN_STATIC_DIR")]
    pub static_dir: Option<PathBuf>,
    #[arg(
        long,
        env = "ADMIN_GITHUB_API_URL",
        default_value = "https://api.github.com"
    )]
    pub github_api_url: String,
    #[arg(
        long,
        env = "ADMIN_GITHUB_AUTH_URL",
        default_value = "https://github.com"
    )]
    pub github_auth_url: String,
}
