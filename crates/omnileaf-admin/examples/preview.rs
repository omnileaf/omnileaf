//! Serves the dashboard against a built-in fake relay and fake GitHub, so a browser can open every page.

use std::{
    collections::HashMap,
    net::SocketAddr,
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};

use anyhow::Context;
use axum::{
    Json, Router,
    extract::{Path, Query},
    http::StatusCode,
    routing::{get, post},
};
use omnileaf_admin::{AppState, Config, router};
use serde_json::{Value, json};

const SESSION_KEY: &str = "preview-only-key-0123456789abcdef";
const RELAY_TOKEN: &str = "preview-relay-token";
const DEFAULT_LISTEN: &str = "127.0.0.1:4180";
const NOW: u64 = 1_740_837_900;

struct Sample {
    code: &'static str,
    age_hours: u64,
    status: &'static str,
    issue: Option<u64>,
    platform: &'static str,
    version: &'static str,
    text: Option<&'static str>,
}

const SAMPLES: [Sample; 5] = [
    Sample {
        code: "R-8M4T-K2QX",
        age_hours: 2,
        status: "received",
        issue: None,
        platform: "android",
        version: "1.4.0",
        text: Some(
            "The reader shows a blank page after I rotate the phone.\n\nSteps:\n1. Open any book\n2. Rotate the phone twice",
        ),
    },
    Sample {
        code: "R-3H7W-P9ZD",
        age_hours: 30,
        status: "reviewing",
        issue: None,
        platform: "linux",
        version: "1.4.0",
        text: Some("Importing a folder with 40 000 files never finishes."),
    },
    Sample {
        code: "R-0A5C-J6VN",
        age_hours: 75,
        status: "published",
        issue: Some(412),
        platform: "ios",
        version: "1.3.2",
        text: Some("Dark mode keeps the old cover colours."),
    },
    Sample {
        code: "R-1B2D-F4GH",
        age_hours: 120,
        status: "published",
        issue: Some(398),
        platform: "windows",
        version: "1.3.2",
        text: Some("Search ignores accents."),
    },
    Sample {
        code: "R-7E9S-M3TY",
        age_hours: 400,
        status: "closed",
        issue: None,
        platform: "macos",
        version: "1.2.9",
        text: None,
    },
];

fn status_of(sample: &Sample) -> Value {
    match sample.issue {
        Some(issue) => json!({ "kind": sample.status, "issue": issue }),
        None => json!({ "kind": sample.status }),
    }
}

fn listed(sample: &Sample) -> Value {
    json!({
        "code": sample.code,
        "receivedAt": NOW - sample.age_hours * 3600,
        "status": status_of(sample),
        "platform": sample.platform,
        "version": sample.version,
    })
}

fn sample_for(code: &str) -> Option<&'static Sample> {
    SAMPLES.iter().find(|sample| sample.code == code)
}

async fn relay_list(Query(query): Query<HashMap<String, String>>) -> Json<Value> {
    let kept = SAMPLES
        .iter()
        .filter(|sample| query.get("status").is_none_or(|kind| sample.status == kind))
        .map(listed)
        .collect();
    Json(Value::Array(kept))
}

async fn relay_detail(Path(code): Path<String>) -> (StatusCode, Json<Value>) {
    match sample_for(&code) {
        Some(sample) => (
            StatusCode::OK,
            Json(json!({
                "listed": listed(sample),
                "report": sample.text,
                "replyAddress": "reporter-reply@example.test",
            })),
        ),
        None => (StatusCode::NOT_FOUND, Json(json!({}))),
    }
}

async fn relay_audit(Path(code): Path<String>) -> Json<Value> {
    let entries = match code.as_str() {
        "R-0A5C-J6VN" => json!([
            { "previous": "reviewing", "status": { "kind": "published", "issue": 412 }, "actor": "reviewer", "at": NOW - 40 * 3600 },
            { "previous": "received", "status": { "kind": "reviewing" }, "actor": "second-reviewer", "at": NOW - 70 * 3600 },
        ]),
        _ => json!([]),
    };
    Json(entries)
}

async fn relay_export(Path(code): Path<String>) -> Json<Value> {
    Json(match sample_for(&code).and_then(|sample| sample.text) {
        Some(text) => json!({ "result": "ready", "body": format!("**Report {code}**\n\n{text}") }),
        None if sample_for(&code).is_some() => json!({ "result": "purged" }),
        None => json!({ "result": "notFound" }),
    })
}

async fn relay_status() -> Json<Value> {
    Json(json!({ "result": "refused", "from": "closed" }))
}

async fn github_token(Json(body): Json<Value>) -> Json<Value> {
    let code = body.get("code").and_then(Value::as_str).unwrap_or_default();
    match code.strip_prefix("code-for-") {
        Some(login) => Json(json!({ "access_token": format!("token-for-{login}") })),
        None => Json(json!({ "error": "bad_verification_code" })),
    }
}

async fn github_user(headers: axum::http::HeaderMap) -> (StatusCode, Json<Value>) {
    let login = headers
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer token-for-"));
    match login {
        Some(login) => (StatusCode::OK, Json(json!({ "login": login }))),
        None => (StatusCode::UNAUTHORIZED, Json(json!({}))),
    }
}

async fn github_membership() -> StatusCode {
    StatusCode::NOT_FOUND
}

async fn serve_fakes() -> anyhow::Result<SocketAddr> {
    let app = Router::new()
        .route("/admin/v1/reports", get(relay_list))
        .route("/admin/v1/reports/{code}", get(relay_detail))
        .route("/admin/v1/reports/{code}/audit", get(relay_audit))
        .route("/admin/v1/reports/{code}/export", get(relay_export))
        .route("/admin/v1/reports/{code}/status", post(relay_status))
        .route("/login/oauth/access_token", post(github_token))
        .route("/user", get(github_user))
        .route(
            "/orgs/{org}/teams/{team}/memberships/{login}",
            get(github_membership),
        );
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let address = listener.local_addr()?;
    tokio::spawn(async move { axum::serve(listener, app).await });
    Ok(address)
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let listen: SocketAddr = std::env::args()
        .nth(1)
        .unwrap_or_else(|| DEFAULT_LISTEN.to_owned())
        .parse()
        .context("read the address to listen on")?;
    let fakes = format!("http://{}", serve_fakes().await?);
    let config = Config {
        github_client_id: "preview-client".to_owned(),
        github_client_secret: "preview-secret".to_owned(),
        github_org: "acme".to_owned(),
        github_team: "reviewers".to_owned(),
        admin_allowlist: vec!["reviewer".to_owned()],
        session_key: SESSION_KEY.to_owned(),
        relay_url: fakes.clone(),
        relay_token: RELAY_TOKEN.to_owned(),
        listen,
        github_api_url: fakes.clone(),
        github_auth_url: fakes,
    };
    let clock = Arc::new(|| {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |elapsed| elapsed.as_secs())
    });
    let state = AppState::new(&config, clock)?;
    let listener = tokio::net::TcpListener::bind(listen)
        .await
        .with_context(|| format!("listen on {listen}"))?;
    axum::serve(listener, router(state))
        .await
        .context("serve the dashboard")
}
