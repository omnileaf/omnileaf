use std::{sync::Arc, time::Duration};

use reqwest::{Client, StatusCode, Url};
use serde::{Deserialize, Serialize};

const TIMEOUT: Duration = Duration::from_secs(10);
const USER_AGENT: &str = "omnileaf-admin";

#[derive(Debug, thiserror::Error)]
pub(crate) enum GitHubError {
    #[error("GitHub could not be reached or answered something unexpected")]
    Unavailable,
}

pub(crate) struct GitHub {
    http: Client,
    auth_url: String,
    api_url: String,
    client_id: String,
    client_secret: String,
    org: String,
    team: String,
}

#[derive(Serialize)]
struct TokenRequest<'a> {
    client_id: &'a str,
    client_secret: &'a str,
    code: &'a str,
}

#[derive(Deserialize)]
struct TokenAnswer {
    access_token: Option<String>,
}

#[derive(Deserialize)]
struct UserAnswer {
    login: String,
}

#[derive(Deserialize)]
struct MembershipAnswer {
    state: String,
}

/// Roots come from `webpki-roots`, so the service needs no certificates in its image.
pub(crate) fn http_client() -> anyhow::Result<Client> {
    let provider = Arc::new(rustls::crypto::ring::default_provider());
    let roots = rustls::RootCertStore::from_iter(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
    let tls = rustls::ClientConfig::builder_with_provider(provider)
        .with_safe_default_protocol_versions()?
        .with_root_certificates(roots)
        .with_no_client_auth();
    Ok(Client::builder()
        .tls_backend_preconfigured(tls)
        .timeout(TIMEOUT)
        .user_agent(USER_AGENT)
        .build()?)
}

impl GitHub {
    pub(crate) fn new(http: Client, config: &crate::Config) -> Self {
        Self {
            http,
            auth_url: config.github_auth_url.trim_end_matches('/').to_owned(),
            api_url: config.github_api_url.trim_end_matches('/').to_owned(),
            client_id: config.github_client_id.clone(),
            client_secret: config.github_client_secret.clone(),
            org: config.github_org.clone(),
            team: config.github_team.clone(),
        }
    }

    pub(crate) fn authorize_url(&self, state: &str) -> Option<Url> {
        let mut url = Url::parse(&format!("{}/login/oauth/authorize", self.auth_url)).ok()?;
        url.query_pairs_mut()
            .append_pair("client_id", &self.client_id)
            .append_pair("scope", "read:org")
            .append_pair("state", state);
        Some(url)
    }

    pub(crate) async fn exchange_code(&self, code: &str) -> Result<String, GitHubError> {
        let answer: TokenAnswer = self
            .http
            .post(format!("{}/login/oauth/access_token", self.auth_url))
            .header("Accept", "application/json")
            .json(&TokenRequest {
                client_id: &self.client_id,
                client_secret: &self.client_secret,
                code,
            })
            .send()
            .await
            .map_err(|_| GitHubError::Unavailable)?
            .error_for_status()
            .map_err(|_| GitHubError::Unavailable)?
            .json()
            .await
            .map_err(|_| GitHubError::Unavailable)?;
        answer.access_token.ok_or(GitHubError::Unavailable)
    }

    pub(crate) async fn login(&self, token: &str) -> Result<String, GitHubError> {
        let answer: UserAnswer = self
            .http
            .get(format!("{}/user", self.api_url))
            .bearer_auth(token)
            .header("Accept", "application/vnd.github+json")
            .send()
            .await
            .map_err(|_| GitHubError::Unavailable)?
            .error_for_status()
            .map_err(|_| GitHubError::Unavailable)?
            .json()
            .await
            .map_err(|_| GitHubError::Unavailable)?;
        let valid = !answer.login.is_empty()
            && answer
                .login
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-');
        valid
            .then_some(answer.login)
            .ok_or(GitHubError::Unavailable)
    }

    pub(crate) async fn is_active_team_member(
        &self,
        token: &str,
        login: &str,
    ) -> Result<bool, GitHubError> {
        let response = self
            .http
            .get(format!(
                "{}/orgs/{}/teams/{}/memberships/{login}",
                self.api_url, self.org, self.team
            ))
            .bearer_auth(token)
            .header("Accept", "application/vnd.github+json")
            .send()
            .await
            .map_err(|_| GitHubError::Unavailable)?;
        match response.status() {
            StatusCode::NOT_FOUND | StatusCode::FORBIDDEN => Ok(false),
            status if status.is_success() => {
                let answer: MembershipAnswer = response
                    .json()
                    .await
                    .map_err(|_| GitHubError::Unavailable)?;
                Ok(answer.state == "active")
            }
            _ => Err(GitHubError::Unavailable),
        }
    }
}
