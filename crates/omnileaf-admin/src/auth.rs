use axum::{
    extract::{FromRequestParts, Query, State},
    http::{HeaderMap, HeaderValue, StatusCode, header, request::Parts},
    response::{IntoResponse, Redirect, Response},
};
use serde::Deserialize;

use crate::{AppState, page::notice, sealed::random_token};

pub(crate) const SESSION_COOKIE: &str = "admin_session";
pub(crate) const STATE_COOKIE: &str = "admin_oauth_state";
const SESSION_LIFETIME: u64 = 8 * 60 * 60;
const STATE_LIFETIME: u64 = 10 * 60;

pub(crate) struct Session {
    pub(crate) login: String,
    cookie: String,
}

impl Session {
    pub(crate) fn from_headers(headers: &HeaderMap, state: &AppState) -> Option<Self> {
        let cookie = cookie_value(headers, SESSION_COOKIE)?;
        let login = state.keys.open(SESSION_COOKIE, &cookie, state.now())?;
        Some(Self { login, cookie })
    }

    pub(crate) fn csrf_token(&self, state: &AppState) -> String {
        state.keys.csrf_token(&self.cookie)
    }

    pub(crate) fn csrf_matches(&self, state: &AppState, token: &str) -> bool {
        state.keys.csrf_matches(&self.cookie, token)
    }
}

impl FromRequestParts<AppState> for Session {
    type Rejection = Response;

    fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> impl Future<Output = Result<Self, Self::Rejection>> {
        std::future::ready(
            Self::from_headers(&parts.headers, state)
                .ok_or_else(|| Redirect::to("/admin/login").into_response()),
        )
    }
}

pub(crate) fn cookie_value(headers: &HeaderMap, name: &str) -> Option<String> {
    headers
        .get_all(header::COOKIE)
        .iter()
        .filter_map(|value| value.to_str().ok())
        .flat_map(|line| line.split(';'))
        .filter_map(|pair| pair.trim().split_once('='))
        .find(|(candidate, _)| *candidate == name)
        .map(|(_, value)| value.to_owned())
}

pub(crate) fn clear_session_cookie(response: &mut Response) {
    set_cookie(response, SESSION_COOKIE, "", 0);
}

fn set_cookie(response: &mut Response, name: &str, value: &str, max_age: u64) {
    let line =
        format!("{name}={value}; Path=/admin; HttpOnly; Secure; SameSite=Lax; Max-Age={max_age}");
    if let Ok(line) = HeaderValue::from_str(&line) {
        response.headers_mut().append(header::SET_COOKIE, line);
    }
}

pub(crate) async fn login(State(state): State<AppState>) -> Response {
    let Ok(random) = random_token() else {
        return notice(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Sign-in failed",
            "Try again in a moment.",
        );
    };
    let Some(target) = state.github.authorize_url(&random) else {
        return notice(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Sign-in failed",
            "Try again in a moment.",
        );
    };
    let sealed = state
        .keys
        .seal(STATE_COOKIE, &random, state.now() + STATE_LIFETIME);
    let mut response = Redirect::to(target.as_str()).into_response();
    set_cookie(&mut response, STATE_COOKIE, &sealed, STATE_LIFETIME);
    response
}

#[derive(Deserialize)]
pub(crate) struct CallbackQuery {
    code: Option<String>,
    state: Option<String>,
}

pub(crate) async fn callback(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(query): Query<CallbackQuery>,
) -> Response {
    let expected = cookie_value(&headers, STATE_COOKIE)
        .and_then(|sealed| state.keys.open(STATE_COOKIE, &sealed, state.now()));
    let (Some(expected), Some(returned), Some(code)) = (expected, query.state, query.code) else {
        return notice(
            StatusCode::BAD_REQUEST,
            "Sign-in failed",
            "Start again from the sign-in page.",
        );
    };
    if expected != returned {
        return notice(
            StatusCode::BAD_REQUEST,
            "Sign-in failed",
            "Start again from the sign-in page.",
        );
    }
    let mut response = match decide(&state, &code).await {
        Ok(Some(login)) => {
            let sealed = state
                .keys
                .seal(SESSION_COOKIE, &login, state.now() + SESSION_LIFETIME);
            let mut response = Redirect::to("/admin").into_response();
            set_cookie(&mut response, SESSION_COOKIE, &sealed, SESSION_LIFETIME);
            response
        }
        Ok(None) => notice(
            StatusCode::FORBIDDEN,
            "Not allowed",
            "This account may not use the review dashboard.",
        ),
        Err(()) => notice(
            StatusCode::BAD_GATEWAY,
            "Sign-in failed",
            "GitHub did not answer. Try again in a moment.",
        ),
    };
    set_cookie(&mut response, STATE_COOKIE, "", 0);
    response
}

async fn decide(state: &AppState, code: &str) -> Result<Option<String>, ()> {
    let token = state.github.exchange_code(code).await.map_err(drop)?;
    let login = state.github.login(&token).await.map_err(drop)?;
    if state.allowlist.contains(&login.to_ascii_lowercase()) {
        return Ok(Some(login));
    }
    let member = state
        .github
        .is_active_team_member(&token, &login)
        .await
        .map_err(drop)?;
    Ok(member.then_some(login))
}
