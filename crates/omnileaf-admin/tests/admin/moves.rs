use axum::http::StatusCode;
use serde_json::json;

use super::support::{Harness, csrf_in};

const CODE: &str = "R-1111-1111";

async fn open() -> (Harness, String, String) {
    let harness = Harness::start(&["alice"]).await;
    harness.relay.add_report(
        CODE,
        1_700_000_100,
        &json!({ "kind": "received" }),
        "linux",
        "1.2.0",
    );
    let cookie = harness.sign_in("alice").await;
    let page = harness
        .get(&format!("/admin/reports/{CODE}"), Some(&cookie))
        .await;
    let csrf = csrf_in(&page.body);
    (harness, cookie, csrf)
}

async fn move_to(
    harness: &Harness,
    cookie: &str,
    csrf: &str,
    fields: &str,
) -> super::support::Reply {
    harness
        .post_form(
            &format!("/admin/reports/{CODE}/status"),
            Some(cookie),
            &format!("csrf={csrf}&{fields}"),
        )
        .await
}

#[tokio::test]
async fn the_detail_offers_every_move_and_the_public_issue_view() {
    let (harness, cookie, _) = open().await;
    let page = harness
        .get(&format!("/admin/reports/{CODE}"), Some(&cookie))
        .await;
    for button in ["reviewing", "published", "duplicate", "closed"] {
        assert!(
            page.body
                .contains(&format!("name=\"status\" value=\"{button}\"")),
            "{button}"
        );
    }
    assert!(page.body.contains(&format!("/admin/reports/{CODE}/issue")));
}

#[tokio::test]
async fn moving_to_reviewing_or_closed_posts_to_the_relay_as_the_signed_in_login() {
    let (harness, cookie, csrf) = open().await;
    for status in ["reviewing", "closed"] {
        let reply = move_to(&harness, &cookie, &csrf, &format!("status={status}")).await;
        assert_eq!(reply.status, StatusCode::SEE_OTHER);
        assert_eq!(reply.location(), format!("/admin/reports/{CODE}"));
    }
    let posts = harness.relay.posts();
    assert_eq!(posts.len(), 2);
    assert_eq!(posts[0].body, json!({ "status": "reviewing" }));
    assert_eq!(posts[1].body, json!({ "status": "closed" }));
    for posted in posts {
        assert_eq!(posted.code, CODE);
        assert_eq!(posted.actor.as_deref(), Some("alice"));
        assert!(posted.authorized);
    }
}

#[tokio::test]
async fn published_and_duplicate_carry_the_issue_number() {
    let (harness, cookie, csrf) = open().await;
    move_to(&harness, &cookie, &csrf, "status=published&issue=42").await;
    move_to(&harness, &cookie, &csrf, "status=duplicate&issue=%2017%20").await;
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
    for fields in [
        "status=published",
        "status=published&issue=",
        "status=duplicate&issue=0",
        "status=duplicate&issue=abc",
        "status=published&issue=-3",
    ] {
        let reply = move_to(&harness, &cookie, &csrf, fields).await;
        assert_eq!(reply.status, StatusCode::BAD_REQUEST, "{fields}");
        assert!(reply.body.contains("issue number"), "{fields}");
        assert!(reply.body.contains("role=\"alert\""), "{fields}");
    }
    assert!(harness.relay.posts().is_empty());
}

#[tokio::test]
async fn a_refusal_from_the_relay_is_shown_on_the_report() {
    let (harness, cookie, csrf) = open().await;
    harness
        .relay
        .answer_status_with(json!({ "result": "refused", "from": "closed" }));
    let reply = move_to(&harness, &cookie, &csrf, "status=reviewing").await;
    assert_eq!(reply.status, StatusCode::CONFLICT);
    assert!(reply.body.contains("role=\"alert\""));
    assert!(
        reply
            .body
            .contains("A closed report cannot be moved to reviewing.")
    );
    assert!(reply.body.contains(&format!("Full text of {CODE}")));
}

#[tokio::test]
async fn a_report_the_relay_no_longer_has_is_a_404() {
    let (harness, cookie, csrf) = open().await;
    harness
        .relay
        .answer_status_with(json!({ "result": "notFound" }));
    let reply = move_to(&harness, &cookie, &csrf, "status=closed").await;
    assert_eq!(reply.status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn a_move_needs_a_session_and_the_csrf_token_that_belongs_to_it() {
    let (harness, cookie, csrf) = open().await;
    let other = {
        harness.github.add_team_member("bob", "active");
        harness.sign_in("bob").await
    };
    let path = format!("/admin/reports/{CODE}/status");
    let anonymous = harness
        .post_form(&path, None, &format!("csrf={csrf}&status=closed"))
        .await;
    assert_eq!(anonymous.status, StatusCode::SEE_OTHER);
    assert_eq!(anonymous.location(), "/admin/login");
    for (who, form) in [
        (&cookie, "status=closed".to_owned()),
        (&cookie, "csrf=wrong&status=closed".to_owned()),
        (&other, format!("csrf={csrf}&status=closed")),
    ] {
        let reply = harness.post_form(&path, Some(who), &form).await;
        assert_eq!(reply.status, StatusCode::FORBIDDEN, "{form}");
    }
    assert!(harness.relay.posts().is_empty());
}

#[tokio::test]
async fn an_unknown_status_or_a_forged_actor_never_reaches_the_relay_as_given() {
    let (harness, cookie, csrf) = open().await;
    let unknown = move_to(&harness, &cookie, &csrf, "status=received").await;
    assert_eq!(unknown.status, StatusCode::BAD_REQUEST);
    assert!(harness.relay.posts().is_empty());
    move_to(&harness, &cookie, &csrf, "status=closed&actor=mallory").await;
    assert_eq!(harness.relay.posts()[0].actor.as_deref(), Some("alice"));
}

#[tokio::test]
async fn the_public_issue_view_shows_the_export_as_text() {
    let (harness, cookie, _) = open().await;
    harness
        .relay
        .answer_export_with(json!({ "result": "ready", "body": "### Crash\n<b>not bold</b>" }));
    harness.relay.leak_reply_address();
    let page = harness
        .get(&format!("/admin/reports/{CODE}/issue"), Some(&cookie))
        .await;
    assert_eq!(page.status, StatusCode::OK);
    assert!(page.body.contains("### Crash\n&lt;b&gt;not bold&lt;/b&gt;"));
    assert!(page.body.contains("<textarea"));
    assert!(!page.body.contains("leaked-reporter"));
}

#[tokio::test]
async fn the_public_issue_view_says_when_the_text_is_gone_or_the_report_unknown() {
    let (harness, cookie, _) = open().await;
    harness
        .relay
        .answer_export_with(json!({ "result": "purged" }));
    let purged = harness
        .get(&format!("/admin/reports/{CODE}/issue"), Some(&cookie))
        .await;
    assert_eq!(purged.status, StatusCode::GONE);
    assert!(purged.body.contains("purged"));
    harness
        .relay
        .answer_export_with(json!({ "result": "notFound" }));
    let unknown = harness
        .get(&format!("/admin/reports/{CODE}/issue"), Some(&cookie))
        .await;
    assert_eq!(unknown.status, StatusCode::NOT_FOUND);
    let anonymous = harness
        .get(&format!("/admin/reports/{CODE}/issue"), None)
        .await;
    assert_eq!(anonymous.location(), "/admin/login");
}
