use omnileaf_relay_proto::ReportCode;
use reqwest::{Client, StatusCode, Url};
use serde::{Deserialize, Serialize};

pub(crate) const LIST_LIMIT: usize = 500;

#[derive(Debug, thiserror::Error)]
pub(crate) enum RelayError {
    #[error("the relay could not be reached or answered something unexpected")]
    Unavailable,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub(crate) struct StatusView {
    pub(crate) kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) issue: Option<u64>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Listed {
    pub(crate) code: ReportCode,
    pub(crate) received_at: u64,
    pub(crate) status: StatusView,
    pub(crate) platform: String,
    pub(crate) version: String,
}

/// The relay's answer also carries a reply address, which is left out here so nothing built from it can show it.
#[derive(Debug, Deserialize)]
pub(crate) struct Detail {
    pub(crate) listed: Listed,
    pub(crate) report: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub(crate) struct AuditEntry {
    pub(crate) previous: String,
    pub(crate) status: StatusView,
    pub(crate) actor: String,
    pub(crate) at: u64,
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum StatusChange {
    Changed,
    NotFound,
    Refused { from: String },
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum Export {
    Ready(String),
    NotFound,
    Purged,
}

#[derive(Serialize)]
struct StatusRequest<'a> {
    status: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    issue: Option<u64>,
}

#[derive(Deserialize)]
struct StatusAnswer {
    result: String,
    from: Option<String>,
}

#[derive(Deserialize)]
struct ExportAnswer {
    result: String,
    body: Option<String>,
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

    pub(crate) async fn list(&self) -> Result<Vec<Listed>, RelayError> {
        let response = self
            .get("reports", &[("limit", LIST_LIMIT.to_string())])
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

    pub(crate) async fn change_status(
        &self,
        code: &ReportCode,
        status: &str,
        issue: Option<u64>,
        actor: &str,
    ) -> Result<StatusChange, RelayError> {
        let answer: StatusAnswer = self
            .http
            .post(format!("{}/admin/v1/reports/{code}/status", self.base))
            .bearer_auth(&self.token)
            .header("X-Admin-Actor", actor)
            .json(&StatusRequest { status, issue })
            .send()
            .await
            .map_err(|_| RelayError::Unavailable)?
            .error_for_status()
            .map_err(|_| RelayError::Unavailable)?
            .json()
            .await
            .map_err(|_| RelayError::Unavailable)?;
        match (answer.result.as_str(), answer.from) {
            ("changed", _) => Ok(StatusChange::Changed),
            ("notFound", _) => Ok(StatusChange::NotFound),
            ("refused", Some(from)) => Ok(StatusChange::Refused { from }),
            _ => Err(RelayError::Unavailable),
        }
    }

    pub(crate) async fn export(&self, code: &ReportCode) -> Result<Export, RelayError> {
        let response = self
            .get(&format!("reports/{code}/export"), &[])
            .await?
            .ok_or(RelayError::Unavailable)?;
        let answer: ExportAnswer = response.json().await.map_err(|_| RelayError::Unavailable)?;
        match (answer.result.as_str(), answer.body) {
            ("ready", Some(body)) => Ok(Export::Ready(body)),
            ("notFound", _) => Ok(Export::NotFound),
            ("purged", _) => Ok(Export::Purged),
            _ => Err(RelayError::Unavailable),
        }
    }
}
