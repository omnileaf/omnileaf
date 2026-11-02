use omnileaf_relay_proto::ReportCode;
use reqwest::{Client, StatusCode, Url};
use serde::Deserialize;

pub(crate) const LIST_LIMIT: usize = 500;

#[derive(Debug, thiserror::Error)]
pub(crate) enum RelayError {
    #[error("the relay could not be reached or answered something unexpected")]
    Unavailable,
}

#[derive(Clone, Debug, Deserialize)]
pub(crate) struct StatusView {
    pub(crate) kind: String,
    pub(crate) issue: Option<u64>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Listed {
    pub(crate) code: ReportCode,
    pub(crate) received_at: u64,
    pub(crate) status: StatusView,
    pub(crate) platform: String,
    pub(crate) version: String,
}

/// The relay's answer also carries a reply address, which is left out here so no page can show it.
#[derive(Debug, Deserialize)]
pub(crate) struct Detail {
    pub(crate) listed: Listed,
    pub(crate) report: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
pub(crate) struct AuditEntry {
    pub(crate) previous: String,
    pub(crate) status: StatusView,
    pub(crate) actor: String,
    pub(crate) at: u64,
}

pub(crate) struct Relay {
    http: Client,
    base: String,
    token: String,
}

impl Relay {
    pub(crate) fn new(http: Client, base: &str, token: &str) -> Self {
        Self {
            http,
            base: base.trim_end_matches('/').to_owned(),
            token: token.to_owned(),
        }
    }

    async fn get(
        &self,
        path: &str,
        query: &[(&str, String)],
    ) -> Result<Option<reqwest::Response>, RelayError> {
        let mut url = Url::parse(&format!("{}/admin/v1/{path}", self.base))
            .map_err(|_| RelayError::Unavailable)?;
        if !query.is_empty() {
            url.query_pairs_mut().extend_pairs(query);
        }
        let response = self
            .http
            .get(url)
            .bearer_auth(&self.token)
            .send()
            .await
            .map_err(|_| RelayError::Unavailable)?;
        match response.status() {
            StatusCode::NOT_FOUND => Ok(None),
            status if status.is_success() => Ok(Some(response)),
            _ => Err(RelayError::Unavailable),
        }
    }

    pub(crate) async fn list(&self, status: Option<&str>) -> Result<Vec<Listed>, RelayError> {
        let mut query = vec![("limit", LIST_LIMIT.to_string())];
        if let Some(status) = status {
            query.push(("status", status.to_owned()));
        }
        let response = self
            .get("reports", &query)
            .await?
            .ok_or(RelayError::Unavailable)?;
        let mut listed: Vec<Listed> = response.json().await.map_err(|_| RelayError::Unavailable)?;
        listed.sort_by_key(|report| std::cmp::Reverse(report.received_at));
        Ok(listed)
    }

    pub(crate) async fn detail(&self, code: &ReportCode) -> Result<Option<Detail>, RelayError> {
        let Some(response) = self.get(&format!("reports/{code}"), &[]).await? else {
            return Ok(None);
        };
        response
            .json()
            .await
            .map(Some)
            .map_err(|_| RelayError::Unavailable)
    }

    pub(crate) async fn audit(&self, code: &ReportCode) -> Result<Vec<AuditEntry>, RelayError> {
        let response = self
            .get(&format!("reports/{code}/audit"), &[])
            .await?
            .ok_or(RelayError::Unavailable)?;
        response.json().await.map_err(|_| RelayError::Unavailable)
    }
}
