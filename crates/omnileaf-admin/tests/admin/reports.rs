use axum::http::StatusCode;
use serde_json::json;

use super::support::Harness;

const FIRST: &str = "R-1111-1111";
const SECOND: &str = "R-2222-2222";
const THIRD: &str = "R-3333-3333";

async fn seeded() -> (Harness, String) {
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

fn position(body: &str, needle: &str) -> usize {
    body.find(needle).unwrap_or(usize::MAX)
}

#[tokio::test]
async fn every_page_sends_a_visitor_without_a_session_to_sign_in() {
    let (harness, _) = seeded().await;
    for path in [
        "/admin".to_owned(),
        format!("/admin/reports/{FIRST}"),
        format!("/admin/reports/{FIRST}/audit"),
    ] {
        let reply = harness.get(&path, None).await;
        assert_eq!(reply.status, StatusCode::SEE_OTHER, "{path}");
        assert_eq!(reply.location(), "/admin/login", "{path}");
        assert!(!reply.body.contains(FIRST), "{path}");
    }
    assert!(harness.relay.requests().is_empty());
}

#[tokio::test]
async fn the_list_shows_the_newest_report_first() {
    let (harness, cookie) = seeded().await;
    let page = harness.get("/admin", Some(&cookie)).await;
    assert_eq!(page.status, StatusCode::OK);
    let order = [
        position(&page.body, SECOND),
        position(&page.body, THIRD),
        position(&page.body, FIRST),
    ];
    assert!(order[0] < order[1] && order[1] < order[2], "{order:?}");
    assert!(page.body.contains("Published, issue #42"));
    assert!(page.body.contains("2023-11-14 22:15 UTC"));
}

#[tokio::test]
async fn the_status_filter_asks_the_relay_for_that_status_only() {
    let (harness, cookie) = seeded().await;
    let page = harness.get("/admin?status=received", Some(&cookie)).await;
    assert!(page.body.contains(FIRST) && page.body.contains(THIRD));
    assert!(!page.body.contains(SECOND));
    let asked = harness.relay.requests().pop().unwrap();
    assert_eq!(
        asked.query.get("status").map(String::as_str),
        Some("received")
    );
    assert!(asked.authorized);
}

#[tokio::test]
async fn an_unknown_status_filter_is_not_passed_to_the_relay() {
    let (harness, cookie) = seeded().await;
    let page = harness.get("/admin?status=%27%3B--", Some(&cookie)).await;
    assert_eq!(page.status, StatusCode::OK);
    assert!(page.body.contains(FIRST) && page.body.contains(SECOND));
    assert!(
        !harness
            .relay
            .requests()
            .iter()
            .any(|seen| seen.query.contains_key("status"))
    );
}

#[tokio::test]
async fn the_platform_and_version_filters_narrow_the_list() {
    let (harness, cookie) = seeded().await;
    let linux = harness.get("/admin?platform=linux", Some(&cookie)).await;
    assert!(
        linux.body.contains(SECOND) && linux.body.contains(THIRD) && !linux.body.contains(FIRST)
    );
    let version = harness
        .get("/admin?platform=linux&version=1.2.0", Some(&cookie))
        .await;
    assert!(
        version.body.contains(THIRD)
            && !version.body.contains(SECOND)
            && !version.body.contains(FIRST)
    );
}

#[tokio::test]
async fn the_filter_form_keeps_what_was_chosen() {
    let (harness, cookie) = seeded().await;
    let page = harness
        .get("/admin?status=received&platform=linux", Some(&cookie))
        .await;
    assert!(
        page.body.contains("<option value=\"received\" selected>"),
        "{}",
        page.body
    );
    assert!(page.body.contains("<option value=\"linux\" selected>"));
}

#[tokio::test]
async fn the_detail_shows_the_full_report_and_its_audit_trail() {
    let (harness, cookie) = seeded().await;
    harness.relay.set_audit(
        SECOND,
        json!([
            { "previous": "reviewing", "status": { "kind": "published", "issue": 42 }, "actor": "alice", "at": 1_700_000_900 },
            { "previous": "received", "status": { "kind": "reviewing" }, "actor": "bob", "at": 1_700_000_500 },
        ]),
    );
    let page = harness
        .get(&format!("/admin/reports/{SECOND}"), Some(&cookie))
        .await;
    assert_eq!(page.status, StatusCode::OK);
    assert!(page.body.contains(&format!("Full text of {SECOND}")));
    assert!(page.body.contains("bob") && page.body.contains("alice"));
    assert!(position(&page.body, "alice") < position(&page.body, "bob"));
}

#[tokio::test]
async fn the_audit_view_lists_the_changes_newest_first() {
    let (harness, cookie) = seeded().await;
    harness.relay.set_audit(
        FIRST,
        json!([{ "previous": "received", "status": { "kind": "reviewing" }, "actor": "carol", "at": 1_700_000_500 }]),
    );
    let page = harness
        .get(&format!("/admin/reports/{FIRST}/audit"), Some(&cookie))
        .await;
    assert_eq!(page.status, StatusCode::OK);
    assert!(page.body.contains("carol") && page.body.contains("2023-11-14 22:21 UTC"));
}

#[tokio::test]
async fn the_reply_address_is_never_asked_for_and_never_shown() {
    let (harness, cookie) = seeded().await;
    harness.relay.leak_reply_address();
    let detail = harness
        .get(&format!("/admin/reports/{FIRST}"), Some(&cookie))
        .await;
    let audit = harness
        .get(&format!("/admin/reports/{FIRST}/audit"), Some(&cookie))
        .await;
    let list = harness.get("/admin", Some(&cookie)).await;
    for page in [detail, audit, list] {
        assert!(!page.body.contains("leaked-reporter"));
        assert!(!page.body.to_lowercase().contains("reply address"));
    }
    let requests = harness.relay.requests();
    assert!(
        requests
            .iter()
            .any(|seen| seen.path == format!("/admin/v1/reports/{FIRST}"))
    );
    assert!(
        requests
            .iter()
            .all(|seen| !seen.query.contains_key("replyAddress"))
    );
}

#[tokio::test]
async fn a_report_text_is_shown_as_text_not_markup() {
    let harness = Harness::start(&["alice"]).await;
    harness
        .relay
        .add_report(FIRST, 1, &json!({ "kind": "received" }), "linux", "1.0.0");
    harness
        .relay
        .set_report_text(FIRST, "<script>alert(1)</script>");
    let cookie = harness.sign_in("alice").await;
    let page = harness
        .get(&format!("/admin/reports/{FIRST}"), Some(&cookie))
        .await;
    assert!(page.body.contains("&lt;script&gt;alert(1)&lt;/script&gt;"));
    assert!(!page.body.contains("<script>"));
}

#[tokio::test]
async fn an_unknown_or_malformed_code_is_a_404_and_a_malformed_one_never_reaches_the_relay() {
    let (harness, cookie) = seeded().await;
    let unknown = harness
        .get("/admin/reports/R-9999-9999", Some(&cookie))
        .await;
    assert_eq!(unknown.status, StatusCode::NOT_FOUND);
    let before = harness.relay.requests().len();
    let malformed = harness
        .get("/admin/reports/..%2Fsecrets", Some(&cookie))
        .await;
    assert_eq!(malformed.status, StatusCode::NOT_FOUND);
    assert_eq!(harness.relay.requests().len(), before);
}

#[tokio::test]
async fn an_unreachable_relay_gives_a_plain_502() {
    let (harness, cookie) = seeded().await;
    harness.relay.reject_everything();
    let page = harness.get("/admin", Some(&cookie)).await;
    assert_eq!(page.status, StatusCode::BAD_GATEWAY);
    assert!(!page.body.contains(FIRST));
}

#[tokio::test]
async fn the_pages_are_navigable_by_keyboard_and_follow_the_colour_scheme() {
    let (harness, cookie) = seeded().await;
    let page = harness.get("/admin", Some(&cookie)).await;
    assert!(page.body.contains("<html lang=\"en\">"));
    assert!(page.body.contains("<a class=\"skip\" href=\"#main\">"));
    assert!(page.body.contains("<main id=\"main\">"));
    let css = harness.get("/admin/style.css", None).await;
    assert_eq!(css.status, StatusCode::OK);
    assert!(css.body.contains("prefers-color-scheme: dark"));
    assert!(css.body.contains(":focus-visible"));
    assert!(css.body.contains("min-height: 44px"));
}
