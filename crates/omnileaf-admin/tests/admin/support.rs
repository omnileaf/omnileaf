#![expect(
    clippy::unwrap_used,
    clippy::indexing_slicing,
    reason = "the harness builds fixed requests, so a failed set-up should stop the test"
)]

use std::{
    collections::HashMap,
    net::SocketAddr,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering},
    },
};

use axum::{
    Json, Router,
    body::Body,
    extract::{Path, Query, State},
    http::{HeaderMap, Request, StatusCode, header},
    response::Response,
    routing::{get, post},
};
use omnileaf_admin::{AppState, Config, router};
use omnileaf_testkit::ScratchFolder;
use serde_json::{Value, json};
use tower::ServiceExt;

pub(crate) const CLIENT_ID: &str = "client-id";
pub(crate) const CLIENT_SECRET: &str = "client-secret";
pub(crate) const SESSION_KEY: &str = "0123456789abcdef0123456789abcdef";
pub(crate) const RELAY_TOKEN: &str = "relay-token";
pub(crate) const START: u64 = 1_700_000_000;
const DEFAULT_LIST_LIMIT: usize = 50;

struct GitHubState {
    memberships: Mutex<HashMap<String, &'static str>>,
    token_requests: AtomicUsize,
}

pub(crate) struct FakeGitHub {
    address: SocketAddr,
    state: Arc<GitHubState>,
}

impl FakeGitHub {
    pub(crate) async fn start() -> Self {
        let state = Arc::new(GitHubState {
            memberships: Mutex::new(HashMap::new()),
            token_requests: AtomicUsize::new(0),
        });
        let app = Router::new()
            .route("/login/oauth/access_token", post(access_token))
            .route("/user", get(user))
            .route(
                "/orgs/{org}/teams/{team}/memberships/{login}",
                get(membership),
            )
            .with_state(Arc::clone(&state));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        Self { address, state }
    }

    pub(crate) fn url(&self) -> String {
        format!("http://{}", self.address)
    }

    pub(crate) fn add_team_member(&self, login: &str, state: &'static str) {
        self.state
            .memberships
            .lock()
            .unwrap()
            .insert(login.to_owned(), state);
    }

    pub(crate) fn token_requests(&self) -> usize {
        self.state.token_requests.load(Ordering::SeqCst)
    }
}

async fn access_token(
    State(state): State<Arc<GitHubState>>,
    Json(body): Json<Value>,
) -> Json<Value> {
    state.token_requests.fetch_add(1, Ordering::SeqCst);
    let code = body["code"].as_str().unwrap_or_default();
    let known_app = body["client_id"] == CLIENT_ID && body["client_secret"] == CLIENT_SECRET;
    match code.strip_prefix("code-for-") {
        Some(login) if known_app => Json(json!({ "access_token": format!("token-for-{login}") })),
        _ => Json(json!({ "error": "bad_verification_code" })),
    }
}

fn bearer_login(headers: &HeaderMap) -> Option<String> {
    let value = headers.get(header::AUTHORIZATION)?.to_str().ok()?;
    let token = value.strip_prefix("Bearer ")?;
    token.strip_prefix("token-for-").map(str::to_owned)
}

async fn user(headers: HeaderMap) -> (StatusCode, Json<Value>) {
    match bearer_login(&headers) {
        Some(login) => (StatusCode::OK, Json(json!({ "login": login }))),
        None => (StatusCode::UNAUTHORIZED, Json(json!({}))),
    }
}

async fn membership(
    State(state): State<Arc<GitHubState>>,
    headers: HeaderMap,
    Path((org, team, login)): Path<(String, String, String)>,
) -> (StatusCode, Json<Value>) {
    let asked_as_that_person = bearer_login(&headers).as_deref() == Some(login.as_str());
    let found = state.memberships.lock().unwrap().get(&login).copied();
    match found {
        Some(membership) if asked_as_that_person && org == "acme" && team == "reviewers" => {
            (StatusCode::OK, Json(json!({ "state": membership })))
        }
        _ => (StatusCode::NOT_FOUND, Json(json!({}))),
    }
}

#[derive(Default)]
struct RelayState {
    reports: Mutex<Vec<Value>>,
    details: Mutex<HashMap<String, Value>>,
    audits: Mutex<HashMap<String, Value>>,
    requests: Mutex<Vec<Seen>>,
    leak_reply_address: AtomicBool,
    reject_everything: AtomicBool,
    posts: Mutex<Vec<Posted>>,
    status_result: Mutex<Option<Value>>,
    export: Mutex<Option<Value>>,
}

#[derive(Clone, Debug)]
pub(crate) struct Posted {
    pub(crate) code: String,
    pub(crate) body: Value,
    pub(crate) actor: Option<String>,
    pub(crate) authorized: bool,
}

#[derive(Clone, Debug)]
pub(crate) struct Seen {
    pub(crate) path: String,
    pub(crate) query: HashMap<String, String>,
    pub(crate) authorized: bool,
}

pub(crate) struct FakeRelay {
    address: SocketAddr,
    state: Arc<RelayState>,
}

impl FakeRelay {
    async fn start() -> Self {
        let state = Arc::new(RelayState::default());
        let app = Router::new()
            .route("/admin/v1/reports", get(relay_list))
            .route("/admin/v1/reports/{code}", get(relay_detail))
            .route("/admin/v1/reports/{code}/audit", get(relay_audit))
            .route("/admin/v1/reports/{code}/export", get(relay_export))
            .route("/admin/v1/reports/{code}/status", post(relay_status))
            .with_state(Arc::clone(&state));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        Self { address, state }
    }

    pub(crate) fn url(&self) -> String {
        format!("http://{}", self.address)
    }

    pub(crate) fn add_report(
        &self,
        code: &str,
        received_at: u64,
        status: &Value,
        platform: &str,
        version: &str,
    ) {
        let listed = json!({
            "code": code, "receivedAt": received_at, "status": status,
            "platform": platform, "version": version,
        });
        self.state.reports.lock().unwrap().push(listed.clone());
        self.state.details.lock().unwrap().insert(
            code.to_owned(),
            json!({ "listed": listed, "report": format!("Full text of {code}"), "replyAddress": null }),
        );
    }

    pub(crate) fn set_audit(&self, code: &str, entries: Value) {
        self.state
            .audits
            .lock()
            .unwrap()
            .insert(code.to_owned(), entries);
    }

    pub(crate) fn set_report_text(&self, code: &str, text: &str) {
        if let Some(detail) = self.state.details.lock().unwrap().get_mut(code) {
            detail["report"] = json!(text);
        }
    }

    pub(crate) fn purge_report_text(&self, code: &str) {
        if let Some(detail) = self.state.details.lock().unwrap().get_mut(code) {
            detail["report"] = Value::Null;
        }
    }

    pub(crate) fn reject_everything(&self) {
        self.state.reject_everything.store(true, Ordering::SeqCst);
    }

    pub(crate) fn answer_status_with(&self, result: Value) {
        *self.state.status_result.lock().unwrap() = Some(result);
    }

    pub(crate) fn answer_export_with(&self, result: Value) {
        *self.state.export.lock().unwrap() = Some(result);
    }

    pub(crate) fn posts(&self) -> Vec<Posted> {
        self.state.posts.lock().unwrap().clone()
    }

    pub(crate) fn leak_reply_address(&self) {
        self.state.leak_reply_address.store(true, Ordering::SeqCst);
    }

    pub(crate) fn requests(&self) -> Vec<Seen> {
        self.state.requests.lock().unwrap().clone()
    }
}

fn note(
    state: &RelayState,
    path: String,
    query: HashMap<String, String>,
    headers: &HeaderMap,
) -> bool {
    let authorized = headers
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        == Some(&format!("Bearer {RELAY_TOKEN}"));
    state.requests.lock().unwrap().push(Seen {
        path,
        query,
        authorized,
    });
    authorized && !state.reject_everything.load(Ordering::SeqCst)
}

async fn relay_list(
    State(state): State<Arc<RelayState>>,
    headers: HeaderMap,
    Query(query): Query<HashMap<String, String>>,
) -> (StatusCode, Json<Value>) {
    if !note(
        &state,
        "/admin/v1/reports".to_owned(),
        query.clone(),
        &headers,
    ) {
        return (StatusCode::UNAUTHORIZED, Json(json!([])));
    }
    let kept: Vec<Value> = state
        .reports
        .lock()
        .unwrap()
        .iter()
        .filter(|report| {
            query
                .get("status")
                .is_none_or(|status| report["status"]["kind"] == status.as_str())
        })
        .take(
            query
                .get("limit")
                .and_then(|limit| limit.parse().ok())
                .unwrap_or(DEFAULT_LIST_LIMIT),
        )
        .cloned()
        .collect();
    (StatusCode::OK, Json(Value::Array(kept)))
}

async fn relay_detail(
    State(state): State<Arc<RelayState>>,
    headers: HeaderMap,
    Path(code): Path<String>,
    Query(query): Query<HashMap<String, String>>,
) -> (StatusCode, Json<Value>) {
    if !note(
        &state,
        format!("/admin/v1/reports/{code}"),
        query.clone(),
        &headers,
    ) {
        return (StatusCode::UNAUTHORIZED, Json(json!({})));
    }
    let found = state.details.lock().unwrap().get(&code).cloned();
    match found {
        Some(mut detail) => {
            if state.leak_reply_address.load(Ordering::SeqCst)
                || query
                    .get("replyAddress")
                    .is_some_and(|value| value == "true")
            {
                detail["replyAddress"] = json!("leaked-reporter@example.test");
            }
            (StatusCode::OK, Json(detail))
        }
        None => (StatusCode::NOT_FOUND, Json(json!({}))),
    }
}

async fn relay_audit(
    State(state): State<Arc<RelayState>>,
    headers: HeaderMap,
    Path(code): Path<String>,
) -> (StatusCode, Json<Value>) {
    if !note(
        &state,
        format!("/admin/v1/reports/{code}/audit"),
        HashMap::new(),
        &headers,
    ) {
        return (StatusCode::UNAUTHORIZED, Json(json!([])));
    }
    let entries = state.audits.lock().unwrap().get(&code).cloned();
    (StatusCode::OK, Json(entries.unwrap_or_else(|| json!([]))))
}

async fn relay_export(
    State(state): State<Arc<RelayState>>,
    headers: HeaderMap,
    Path(code): Path<String>,
) -> (StatusCode, Json<Value>) {
    if !note(
        &state,
        format!("/admin/v1/reports/{code}/export"),
        HashMap::new(),
        &headers,
    ) {
        return (StatusCode::UNAUTHORIZED, Json(json!({})));
    }
    let answer = state.export.lock().unwrap().clone();
    (
        StatusCode::OK,
        Json(answer.unwrap_or_else(|| json!({ "result": "notFound" }))),
    )
}

async fn relay_status(
    State(state): State<Arc<RelayState>>,
    headers: HeaderMap,
    Path(code): Path<String>,
    Json(body): Json<Value>,
) -> (StatusCode, Json<Value>) {
    let authorized = note(
        &state,
        format!("/admin/v1/reports/{code}/status"),
        HashMap::new(),
        &headers,
    );
    let actor = headers
        .get("x-admin-actor")
        .and_then(|value| value.to_str().ok())
        .map(str::to_owned);
    state.posts.lock().unwrap().push(Posted {
        code,
        body,
        actor,
        authorized,
    });
    if !authorized {
        return (StatusCode::UNAUTHORIZED, Json(json!({})));
    }
    let answer = state.status_result.lock().unwrap().clone();
    (
        StatusCode::OK,
        Json(answer.unwrap_or_else(|| json!({ "result": "changed" }))),
    )
}

pub(crate) struct Harness {
    pub(crate) github: FakeGitHub,
    pub(crate) relay: FakeRelay,
    pub(crate) now: Arc<AtomicU64>,
    app: Router,
}

pub(crate) struct Reply {
    pub(crate) status: StatusCode,
    pub(crate) headers: HeaderMap,
    pub(crate) body: String,
}

impl Reply {
    pub(crate) fn location(&self) -> &str {
        self.headers
            .get(header::LOCATION)
            .and_then(|value| value.to_str().ok())
            .unwrap_or_default()
    }

    pub(crate) fn set_cookies(&self) -> Vec<String> {
        self.headers
            .get_all(header::SET_COOKIE)
            .iter()
            .filter_map(|value| value.to_str().ok().map(str::to_owned))
            .collect()
    }

    pub(crate) fn cookie_line(&self, name: &str) -> Option<String> {
        self.set_cookies()
            .into_iter()
            .find(|line| line.starts_with(&format!("{name}=")))
    }

    pub(crate) fn cookie_pair(&self, name: &str) -> Option<String> {
        let line = self.cookie_line(name)?;
        Some(line.split(';').next()?.to_owned())
    }
}

impl Harness {
    pub(crate) async fn start(allowlist: &[&str]) -> Self {
        Self::start_serving(allowlist, None).await
    }

    pub(crate) async fn start_serving(allowlist: &[&str], site: Option<&Site>) -> Self {
        Self::try_start_serving(allowlist, site).await.unwrap()
    }

    pub(crate) async fn try_start_serving(
        allowlist: &[&str],
        site: Option<&Site>,
    ) -> anyhow::Result<Self> {
        let github = FakeGitHub::start().await;
        let relay = FakeRelay::start().await;
        let config = Config {
            github_client_id: CLIENT_ID.to_owned(),
            github_client_secret: CLIENT_SECRET.to_owned(),
            github_org: "acme".to_owned(),
            github_team: "reviewers".to_owned(),
            admin_allowlist: allowlist.iter().map(|login| (*login).to_owned()).collect(),
            session_key: SESSION_KEY.to_owned(),
            relay_url: relay.url(),
            relay_token: RELAY_TOKEN.to_owned(),
            listen: "127.0.0.1:0".parse().unwrap(),
            static_dir: site.map(|site| site.folder.path().to_path_buf()),
            github_api_url: github.url(),
            github_auth_url: github.url(),
        };
        let now = Arc::new(AtomicU64::new(START));
        let clock = Arc::clone(&now);
        let state = AppState::new(&config, Arc::new(move || clock.load(Ordering::SeqCst)))?;
        Ok(Self {
            github,
            relay,
            now,
            app: router(state),
        })
    }

    pub(crate) fn advance(&self, seconds: u64) {
        self.now.fetch_add(seconds, Ordering::SeqCst);
    }

    pub(crate) async fn send(&self, request: Request<Body>) -> Reply {
        let response: Response = self.app.clone().oneshot(request).await.unwrap();
        let (parts, body) = response.into_parts();
        let bytes = axum::body::to_bytes(body, usize::MAX).await.unwrap();
        Reply {
            status: parts.status,
            headers: parts.headers,
            body: String::from_utf8_lossy(&bytes).into_owned(),
        }
    }

    pub(crate) async fn get(&self, path: &str, cookie: Option<&str>) -> Reply {
        let mut request = Request::get(path);
        if let Some(cookie) = cookie {
            request = request.header(header::COOKIE, cookie);
        }
        self.send(request.body(Body::empty()).unwrap()).await
    }

    pub(crate) async fn post_form(&self, path: &str, cookie: Option<&str>, form: &str) -> Reply {
        let mut request =
            Request::post(path).header(header::CONTENT_TYPE, "application/x-www-form-urlencoded");
        if let Some(cookie) = cookie {
            request = request.header(header::COOKIE, cookie);
        }
        self.send(request.body(Body::from(form.to_owned())).unwrap())
            .await
    }

    pub(crate) async fn post_json(
        &self,
        path: &str,
        cookie: Option<&str>,
        csrf: Option<&str>,
        body: &str,
    ) -> Reply {
        let mut request = Request::post(path).header(header::CONTENT_TYPE, "application/json");
        if let Some(cookie) = cookie {
            request = request.header(header::COOKIE, cookie);
        }
        if let Some(csrf) = csrf {
            request = request.header("x-csrf-token", csrf);
        }
        self.send(request.body(Body::from(body.to_owned())).unwrap())
            .await
    }

    pub(crate) async fn start_sign_in(&self) -> (String, String) {
        let reply = self.get("/admin/login", None).await;
        let target = reqwest::Url::parse(reply.location()).unwrap();
        let state = target
            .query_pairs()
            .find(|(name, _)| name == "state")
            .map(|(_, value)| value.into_owned())
            .unwrap();
        (state, reply.cookie_pair("admin_oauth_state").unwrap())
    }

    pub(crate) async fn finish_sign_in(&self, login: &str) -> Reply {
        let (state, state_cookie) = self.start_sign_in().await;
        let path = format!("/admin/auth/callback?code=code-for-{login}&state={state}");
        self.get(&path, Some(&state_cookie)).await
    }

    pub(crate) async fn sign_in(&self, login: &str) -> String {
        let reply = self.finish_sign_in(login).await;
        assert_eq!(reply.status, StatusCode::SEE_OTHER, "{}", reply.body);
        reply.cookie_pair("admin_session").unwrap()
    }
}

pub(crate) fn json_of(text: &str) -> Value {
    serde_json::from_str(text).unwrap()
}

pub(crate) fn csrf_in(page: &str) -> String {
    page.split("name=\"csrf\" value=\"")
        .nth(1)
        .and_then(|rest| rest.split('"').next())
        .unwrap()
        .to_owned()
}

pub(crate) const FIRST: &str = "R-1111-1111";
pub(crate) const SECOND: &str = "R-2222-2222";
pub(crate) const THIRD: &str = "R-3333-3333";

pub(crate) async fn seeded() -> (Harness, String) {
    let harness = Harness::start(&["alice"]).await;
    harness.relay.add_report(
        FIRST,
        1_700_000_100,
        &json!({ "kind": "received" }),
        "android",
        "1.2.0",
    );
    harness.relay.add_report(
        SECOND,
        1_700_000_300,
        &json!({ "kind": "published", "issue": 42 }),
        "linux",
        "1.3.0",
    );
    harness.relay.add_report(
        THIRD,
        1_700_000_200,
        &json!({ "kind": "received" }),
        "linux",
        "1.2.0",
    );
    let cookie = harness.sign_in("alice").await;
    (harness, cookie)
}

pub(crate) struct Site {
    folder: ScratchFolder,
}

impl Site {
    pub(crate) fn with(files: &[(&str, &str)]) -> Self {
        let folder = ScratchFolder::new("ui");
        for (path, contents) in files {
            folder.write(path, contents.as_bytes());
        }
        Self { folder }
    }

    pub(crate) fn put(&self, path: &str, bytes: &[u8]) {
        self.folder.write(path, bytes);
    }

    pub(crate) fn beside(&self, name: &str, contents: &str) {
        let path = self.outside(name);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, contents).unwrap();
    }

    pub(crate) fn outside(&self, name: &str) -> std::path::PathBuf {
        self.folder.path().parent().unwrap().join(name)
    }

    #[cfg(unix)]
    pub(crate) fn link(&self, name: &str, target: &str) {
        let parent = self.folder.path().parent().unwrap();
        std::os::unix::fs::symlink(parent.join(target), self.folder.path().join(name)).unwrap();
    }
}
