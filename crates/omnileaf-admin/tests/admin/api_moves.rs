#![expect(
    clippy::unwrap_used,
    clippy::indexing_slicing,
    reason = "answers are fixed JSON, so a failed parse should stop the test"
)]

use axum::{
    body::Body,
    http::{Request, StatusCode, header},
};
use serde_json::{Value, json};

use super::support::{FIRST, Harness, seeded};

const MOVE_PATH: &str = "/admin/api/reports/R-1111-1111/status";
const LOGOUT_PATH: &str = "/admin/api/logout";

fn json_of(text: &str) -> Value {
    serde_json::from_str(text).unwrap()
}

async fn open() -> (Harness, String, String) {
    let (harness, cookie) = seeded().await;
    let session = json_of(&harness.get("/admin/api/session", Some(&cookie)).await.body);
    let csrf = session["csrf"].as_str().unwrap().to_owned();
    (harness, cookie, csrf)
}

async fn move_to(
    harness: &Harness,
    cookie: &str,
    csrf: &str,
    body: Value,
) -> super::support::Reply {
    harness
        .post_json(MOVE_PATH, Some(cookie), Some(csrf), &body.to_string())
        .await
}

#[tokio::test]
async fn a_visitor_without_a_session_gets_a_401_on_both_routes() {
    let (harness, _) = seeded().await;
    for path in [MOVE_PATH, LOGOUT_PATH] {
        let reply = harness.post_json(path, None, None, "{}").await;
        assert_eq!(reply.status, StatusCode::UNAUTHORIZED, "{path}");
        assert_eq!(
            json_of(&reply.body),
            json!({ "error": "signedOut" }),
            "{path}"
        );
    }
    assert!(harness.relay.posts().is_empty());
}

#[tokio::test]
async fn a_missing_or_wrong_csrf_token_is_a_403_that_never_reaches_the_relay() {
    let (harness, cookie, csrf) = open().await;
    harness.advance(1);
    let other_session = harness.sign_in("alice").await;
    let foreign = json_of(
        &harness
            .get("/admin/api/session", Some(&other_session))
            .await
            .body,
    )["csrf"]
        .as_str()
        .unwrap()
        .to_owned();
    assert_ne!(foreign, csrf);
    for token in [None, Some(""), Some("nope"), Some(foreign.as_str())] {
        let reply = harness
            .post_json(MOVE_PATH, Some(&cookie), token, r#"{"status":"closed"}"#)
            .await;
        assert_eq!(reply.status, StatusCode::FORBIDDEN, "{token:?}");
        assert_eq!(
            json_of(&reply.body),
            json!({ "error": "csrfRejected" }),
            "{token:?}"
        );
    }
    assert!(harness.relay.posts().is_empty());
}

#[tokio::test]
async fn moving_to_reviewing_or_closed_posts_to_the_relay_as_the_signed_in_login() {
    let (harness, cookie, csrf) = open().await;
    for status in ["reviewing", "closed"] {
        let reply = move_to(&harness, &cookie, &csrf, json!({ "status": status })).await;
        assert_eq!(reply.status, StatusCode::OK, "{status}");
        assert_eq!(
            json_of(&reply.body),
            json!({ "result": "changed" }),
            "{status}"
        );
    }
    let posts = harness.relay.posts();
    assert_eq!(posts.len(), 2);
    assert_eq!(posts[0].body, json!({ "status": "reviewing" }));
    assert_eq!(posts[1].body, json!({ "status": "closed" }));
    for posted in posts {
        assert_eq!(posted.code, FIRST);
        assert_eq!(posted.actor.as_deref(), Some("alice"));
        assert!(posted.authorized);
    }
}

#[tokio::test]
async fn moving_to_reviewing_or_closed_drops_a_stray_issue_number() {
    let (harness, cookie, csrf) = open().await;
    move_to(
        &harness,
        &cookie,
        &csrf,
        json!({ "status": "closed", "issue": 7 }),
    )
    .await;
    assert_eq!(harness.relay.posts()[0].body, json!({ "status": "closed" }));
}

#[tokio::test]
async fn published_and_duplicate_carry_the_issue_number() {
    let (harness, cookie, csrf) = open().await;
    move_to(
        &harness,
        &cookie,
        &csrf,
        json!({ "status": "published", "issue": 42 }),
    )
    .await;
    move_to(
        &harness,
        &cookie,
        &csrf,
        json!({ "status": "duplicate", "issue": 17 }),
    )
    .await;
    let bodies: Vec<_> = harness
        .relay
        .posts()
        .into_iter()
        .map(|posted| posted.body)
        .collect();
    assert_eq!(
        bodies,
        [
            json!({ "status": "published", "issue": 42 }),
            json!({ "status": "duplicate", "issue": 17 })
        ]
    );
}

#[tokio::test]
async fn an_issue_move_without_a_usable_number_is_refused_before_the_relay() {
    let (harness, cookie, csrf) = open().await;
    for body in [
        json!({ "status": "published" }),
        json!({ "status": "published", "issue": null }),
        json!({ "status": "duplicate", "issue": 0 }),
    ] {
        let reply = move_to(&harness, &cookie, &csrf, body.clone()).await;
        assert_eq!(reply.status, StatusCode::BAD_REQUEST, "{body}");
        assert_eq!(
            json_of(&reply.body),
            json!({ "error": "issueRequired" }),
            "{body}"
        );
    }
    assert!(harness.relay.posts().is_empty());
}

#[tokio::test]
async fn a_body_that_is_not_a_move_is_a_json_400_before_the_relay() {
    let (harness, cookie, csrf) = open().await;
    for body in [
        "",
        "not json",
        "{}",
        r#"{"status":"received"}"#,
        r#"{"status":"nope"}"#,
        r#"{"status":"closed","issue":-3}"#,
        r#"{"status":"published","issue":"42"}"#,
    ] {
        let reply = harness
            .post_json(MOVE_PATH, Some(&cookie), Some(&csrf), body)
            .await;
        assert_eq!(reply.status, StatusCode::BAD_REQUEST, "{body}");
        assert_eq!(
            json_of(&reply.body),
            json!({ "error": "badRequest" }),
            "{body}"
        );
    }
    assert!(harness.relay.posts().is_empty());
}

#[tokio::test]
async fn a_form_post_is_a_json_400_before_the_relay() {
    let (harness, cookie, csrf) = open().await;
    let request = Request::post(MOVE_PATH)
        .header(header::CONTENT_TYPE, "application/x-www-form-urlencoded")
        .header(header::COOKIE, &cookie)
        .header("x-csrf-token", &csrf)
        .body(Body::from("status=closed"))
        .unwrap();
    let reply = harness.send(request).await;
    assert_eq!(reply.status, StatusCode::BAD_REQUEST);
    assert_eq!(json_of(&reply.body), json!({ "error": "badRequest" }));
    assert!(harness.relay.posts().is_empty());
}

#[tokio::test]
async fn a_malformed_code_is_a_json_404_before_the_relay() {
    let (harness, cookie, csrf) = open().await;
    for code in ["..%2Fsecrets", "%FF", "r-1111-1111"] {
        let reply = harness
            .post_json(
                &format!("/admin/api/reports/{code}/status"),
                Some(&cookie),
                Some(&csrf),
                r#"{"status":"closed"}"#,
            )
            .await;
        assert_eq!(reply.status, StatusCode::NOT_FOUND, "{code}");
        assert_eq!(
            json_of(&reply.body),
            json!({ "error": "notFound" }),
            "{code}"
        );
    }
    assert!(harness.relay.posts().is_empty());
}

#[tokio::test]
async fn a_report_the_relay_does_not_know_is_a_404() {
    let (harness, cookie, csrf) = open().await;
    harness
        .relay
        .answer_status_with(json!({ "result": "notFound" }));
    let reply = move_to(&harness, &cookie, &csrf, json!({ "status": "closed" })).await;
    assert_eq!(reply.status, StatusCode::NOT_FOUND);
    assert_eq!(json_of(&reply.body), json!({ "error": "notFound" }));
}

#[tokio::test]
async fn a_refusal_from_the_relay_is_a_409_that_names_the_current_status() {
    let (harness, cookie, csrf) = open().await;
    harness
        .relay
        .answer_status_with(json!({ "result": "refused", "from": "closed" }));
    let reply = move_to(&harness, &cookie, &csrf, json!({ "status": "reviewing" })).await;
    assert_eq!(reply.status, StatusCode::CONFLICT);
    assert_eq!(
        json_of(&reply.body),
        json!({ "error": "refused", "from": "closed" })
    );
}

#[tokio::test]
async fn a_relay_that_refuses_the_move_is_a_502() {
    let (harness, cookie, csrf) = open().await;
    harness.relay.reject_everything();
    let reply = move_to(&harness, &cookie, &csrf, json!({ "status": "closed" })).await;
    assert_eq!(reply.status, StatusCode::BAD_GATEWAY);
    assert_eq!(json_of(&reply.body), json!({ "error": "relayUnavailable" }));
}

#[tokio::test]
async fn signing_out_needs_the_csrf_token() {
    let (harness, cookie, _) = open().await;
    for token in [None, Some("nope")] {
        let reply = harness
            .post_json(LOGOUT_PATH, Some(&cookie), token, "")
            .await;
        assert_eq!(reply.status, StatusCode::FORBIDDEN, "{token:?}");
        assert_eq!(
            json_of(&reply.body),
            json!({ "error": "csrfRejected" }),
            "{token:?}"
        );
        assert!(!reply.headers.contains_key(header::SET_COOKIE));
    }
}

#[tokio::test]
async fn signing_out_clears_the_session_cookie() {
    let (harness, cookie, csrf) = open().await;
    let reply = harness
        .post_json(LOGOUT_PATH, Some(&cookie), Some(&csrf), "")
        .await;
    assert_eq!(reply.status, StatusCode::NO_CONTENT);
    assert!(reply.body.is_empty());
    let cleared = reply.headers[header::SET_COOKIE].to_str().unwrap();
    assert!(cleared.starts_with("admin_session=;"), "{cleared}");
    assert!(cleared.contains("Max-Age=0"), "{cleared}");
}

#[tokio::test]
async fn every_answer_carries_the_hardening_headers() {
    let (harness, cookie, csrf) = open().await;
    let replies = [
        move_to(&harness, &cookie, &csrf, json!({ "status": "closed" })).await,
        move_to(&harness, &cookie, &csrf, json!({})).await,
        harness
            .post_json(MOVE_PATH, Some(&cookie), None, "{}")
            .await,
        harness.post_json(MOVE_PATH, None, None, "{}").await,
        harness
            .post_json(LOGOUT_PATH, Some(&cookie), Some(&csrf), "")
            .await,
    ];
    for reply in replies {
        assert_eq!(reply.headers[header::CACHE_CONTROL], "no-store");
        assert_eq!(reply.headers[header::X_CONTENT_TYPE_OPTIONS], "nosniff");
        assert_eq!(reply.headers[header::X_FRAME_OPTIONS], "DENY");
        assert!(reply.headers.contains_key(header::CONTENT_SECURITY_POLICY));
    }
}
