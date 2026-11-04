use axum::http::StatusCode;

use super::support::{Harness, json_of};

fn query_of(location: &str) -> Vec<(String, String)> {
    reqwest::Url::parse(location).map_or_else(
        |_| Vec::new(),
        |url| {
            url.query_pairs()
                .map(|(name, value)| (name.into_owned(), value.into_owned()))
                .collect()
        },
    )
}

#[tokio::test]
async fn login_sends_the_visitor_to_github_with_a_signed_state_cookie() {
    let harness = Harness::start(&["alice"]).await;
    let reply = harness.get("/admin/login", None).await;
    assert_eq!(reply.status, StatusCode::SEE_OTHER);
    let target = reqwest::Url::parse(reply.location()).unwrap();
    assert_eq!(target.path(), "/login/oauth/authorize");
    let query = query_of(reply.location());
    assert!(query.contains(&("client_id".to_owned(), "client-id".to_owned())));
    assert!(query.contains(&("scope".to_owned(), "read:org".to_owned())));
    let state = &query.iter().find(|(name, _)| name == "state").unwrap().1;
    assert!(state.len() >= 32);
    let cookie = reply.cookie_line("admin_oauth_state").unwrap();
    for attribute in ["HttpOnly", "Secure", "SameSite=Lax", "Max-Age=600"] {
        assert!(cookie.contains(attribute), "{cookie}");
    }
    assert!(
        !cookie.contains(state.as_str()),
        "the state must not be readable in the cookie"
    );
}

#[tokio::test]
async fn an_allowlisted_login_signs_in_whatever_its_case() {
    let harness = Harness::start(&["Alice"]).await;
    let cookie = harness.sign_in("alice").await;
    let session = harness.get("/admin/api/session", Some(&cookie)).await;
    assert_eq!(session.status, StatusCode::OK);
    assert_eq!(json_of(&session.body)["login"], "alice");
}

#[tokio::test]
async fn the_session_cookie_is_hardened_and_lasts_eight_hours() {
    let harness = Harness::start(&["alice"]).await;
    let reply = harness.finish_sign_in("alice").await;
    assert_eq!(reply.location(), "/admin");
    let cookie = reply.cookie_line("admin_session").unwrap();
    for attribute in [
        "HttpOnly",
        "Secure",
        "SameSite=Lax",
        "Max-Age=28800",
        "Path=/admin",
    ] {
        assert!(cookie.contains(attribute), "{cookie}");
    }
    let state = reply.cookie_line("admin_oauth_state").unwrap();
    assert!(state.contains("Max-Age=0"), "{state}");
}

#[tokio::test]
async fn an_active_team_member_signs_in() {
    let harness = Harness::start(&[]).await;
    harness.github.add_team_member("bob", "active");
    let cookie = harness.sign_in("bob").await;
    let session = harness.get("/admin/api/session", Some(&cookie)).await;
    assert_eq!(session.status, StatusCode::OK);
}

#[tokio::test]
async fn a_person_in_neither_list_gets_a_403_that_shows_nothing_and_no_session() {
    let harness = Harness::start(&["alice"]).await;
    let reply = harness.finish_sign_in("mallory").await;
    assert_eq!(reply.status, StatusCode::FORBIDDEN);
    assert!(reply.cookie_line("admin_session").is_none());
    assert!(!reply.body.contains("mallory"));
    assert!(!reply.body.contains("received"));
}

#[tokio::test]
async fn a_pending_team_membership_does_not_count() {
    let harness = Harness::start(&[]).await;
    harness.github.add_team_member("carol", "pending");
    let reply = harness.finish_sign_in("carol").await;
    assert_eq!(reply.status, StatusCode::FORBIDDEN);
    assert!(reply.cookie_line("admin_session").is_none());
}

#[tokio::test]
async fn a_wrong_state_is_refused_before_github_is_asked_anything() {
    let harness = Harness::start(&["alice"]).await;
    let (_, state_cookie) = harness.start_sign_in().await;
    let wrong = harness
        .get(
            "/admin/auth/callback?code=code-for-alice&state=not-the-state",
            Some(&state_cookie),
        )
        .await;
    assert_eq!(wrong.status, StatusCode::BAD_REQUEST);
    assert!(wrong.cookie_line("admin_session").is_none());

    let (state, _) = harness.start_sign_in().await;
    let no_cookie = harness
        .get(
            &format!("/admin/auth/callback?code=code-for-alice&state={state}"),
            None,
        )
        .await;
    assert_eq!(no_cookie.status, StatusCode::BAD_REQUEST);

    let forged = harness
        .get(
            &format!("/admin/auth/callback?code=code-for-alice&state={state}"),
            Some(&format!("admin_oauth_state={state}")),
        )
        .await;
    assert_eq!(forged.status, StatusCode::BAD_REQUEST);
    assert_eq!(harness.github.token_requests(), 0);
}

#[tokio::test]
async fn an_old_state_is_refused() {
    let harness = Harness::start(&["alice"]).await;
    let (state, state_cookie) = harness.start_sign_in().await;
    harness.advance(601);
    let reply = harness
        .get(
            &format!("/admin/auth/callback?code=code-for-alice&state={state}"),
            Some(&state_cookie),
        )
        .await;
    assert_eq!(reply.status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn a_code_github_rejects_does_not_sign_anyone_in() {
    let harness = Harness::start(&["alice"]).await;
    let (state, state_cookie) = harness.start_sign_in().await;
    let reply = harness
        .get(
            &format!("/admin/auth/callback?code=stale&state={state}"),
            Some(&state_cookie),
        )
        .await;
    assert_eq!(reply.status, StatusCode::BAD_GATEWAY);
    assert!(reply.cookie_line("admin_session").is_none());
}

#[tokio::test]
async fn the_state_cookie_cannot_stand_in_for_a_session() {
    let harness = Harness::start(&["alice"]).await;
    let (_, state_cookie) = harness.start_sign_in().await;
    let as_session = state_cookie.replacen("admin_oauth_state", "admin_session", 1);
    let reply = harness.get("/admin/api/session", Some(&as_session)).await;
    assert_eq!(reply.status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn the_failure_pages_are_plain_pages_with_their_own_small_stylesheet() {
    let harness = Harness::start(&["alice"]).await;
    let refused = harness.finish_sign_in("mallory").await;
    assert!(refused.body.contains("<html lang=\"en\">"));
    assert!(refused.body.contains("<main id=\"main\">"));
    assert!(
        refused
            .body
            .contains("<link rel=\"stylesheet\" href=\"/admin/style.css\">")
    );
    assert!(!refused.body.contains("<script"));
    let css = harness.get("/admin/style.css", None).await;
    assert_eq!(css.status, StatusCode::OK);
    assert!(css.body.contains("prefers-color-scheme: dark"));
    assert!(css.body.contains(":focus-visible"));
    assert!(css.body.contains("min-height: 44px"));
}
