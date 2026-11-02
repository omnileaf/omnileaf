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
        atomic::{AtomicU64, AtomicUsize, Ordering},
    },
};

use axum::{
    Json, Router,
    body::Body,
    extract::{Path, State},
    http::{HeaderMap, Request, StatusCode, header},
    response::Response,
    routing::{get, post},
};
use omnileaf_admin::{AppState, Config, router};
use serde_json::{Value, json};
use tower::ServiceExt;

pub(crate) const CLIENT_ID: &str = "client-id";
pub(crate) const CLIENT_SECRET: &str = "client-secret";
pub(crate) const SESSION_KEY: &str = "0123456789abcdef0123456789abcdef";
pub(crate) const START: u64 = 1_700_000_000;

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

pub(crate) struct Harness {
    pub(crate) github: FakeGitHub,
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
        let github = FakeGitHub::start().await;
        let config = Config {
            github_client_id: CLIENT_ID.to_owned(),
            github_client_secret: CLIENT_SECRET.to_owned(),
            github_org: "acme".to_owned(),
            github_team: "reviewers".to_owned(),
            admin_allowlist: allowlist.iter().map(|login| (*login).to_owned()).collect(),
            session_key: SESSION_KEY.to_owned(),
            relay_url: "http://127.0.0.1:9".to_owned(),
            relay_token: "relay-token".to_owned(),
            listen: "127.0.0.1:0".parse().unwrap(),
            github_api_url: github.url(),
            github_auth_url: github.url(),
        };
        let now = Arc::new(AtomicU64::new(START));
        let clock = Arc::clone(&now);
        let state = AppState::new(&config, Arc::new(move || clock.load(Ordering::SeqCst))).unwrap();
        Self {
            github,
            now,
            app: router(state),
        }
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
