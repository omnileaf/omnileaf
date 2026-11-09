#![expect(
    clippy::indexing_slicing,
    reason = "fixtures and answers are fixed JSON, so a failed parse should stop the test"
)]

use axum::http::{StatusCode, header};
use serde_json::json;

use super::support::{FIRST, Harness, Reply, SECOND, json_of, seeded};

const LEAKED_ADDRESS: &str = "leaked-reporter@example.test";
const SESSION_SECONDS: u64 = 8 * 60 * 60;
const LIST_LIMIT: u64 = 500;

async fn seeded_with_audit() -> (Harness, String) {
    let (harness, cookie) = seeded().await;
    harness.relay.set_audit(
        SECOND,
        json!([
            {
                "previous": "reviewing",
                "status": { "kind": "published", "issue": 42 },
                "actor": "alice",
                "at": 1_700_000_350,
            },
            {
                "previous": "received",
                "status": { "kind": "reviewing" },
                "actor": "bob",
                "at": 1_700_000_320,
            },
        ]),
    );
    (harness, cookie)
}

fn all_routes() -> [String; 4] {
    [
        "/admin/api/session".to_owned(),
        "/admin/api/reports".to_owned(),
        format!("/admin/api/reports/{SECOND}"),
        format!("/admin/api/reports/{SECOND}/issue"),
    ]
}

#[tokio::test]
async fn a_visitor_without_a_session_gets_a_401_not_a_redirect() {
    let (harness, _) = seeded().await;
    for path in all_routes() {
        let reply = harness.get(&path, None).await;
        assert_eq!(reply.status, StatusCode::UNAUTHORIZED, "{path}");
        assert_eq!(
            json_of(&reply.body),
            json!({ "error": "signedOut" }),
            "{path}"
        );
        assert!(reply.location().is_empty(), "{path}");
    }
    assert!(harness.relay.requests().is_empty());
}

#[tokio::test]
async fn a_forged_session_is_a_401_and_never_reaches_the_relay() {
    let (harness, cookie) = seeded().await;
    let value = cookie.strip_prefix("admin_session=").unwrap();
    let (payload, tag) = value.split_once('.').unwrap();
    let mut flipped = tag.to_owned();
    flipped.replace_range(0..1, if tag.starts_with('A') { "B" } else { "A" });
    for forged in [
        format!("admin_session={payload}.{flipped}"),
        format!("admin_session=YWRtaW46OTk5OTk5OTk5OQ.{tag}"),
        "admin_session=garbage".to_owned(),
    ] {
        let reply = harness.get("/admin/api/reports", Some(&forged)).await;
        assert_eq!(reply.status, StatusCode::UNAUTHORIZED, "{forged}");
    }
    assert!(harness.relay.requests().is_empty());
}

#[tokio::test]
async fn an_expired_session_is_a_401_and_never_reaches_the_relay() {
    let (harness, cookie) = seeded().await;
    harness.advance(SESSION_SECONDS);
    for path in all_routes() {
        let reply = harness.get(&path, Some(&cookie)).await;
        assert_eq!(reply.status, StatusCode::UNAUTHORIZED, "{path}");
    }
    assert!(harness.relay.requests().is_empty());
}

#[tokio::test]
async fn a_session_is_still_valid_one_second_before_it_expires() {
    let (harness, cookie) = seeded().await;
    harness.advance(SESSION_SECONDS - 1);
    let reply = harness.get("/admin/api/session", Some(&cookie)).await;
    assert_eq!(reply.status, StatusCode::OK);
}

#[tokio::test]
async fn the_session_names_the_login_and_a_csrf_token_that_stays_the_same() {
    let (harness, cookie) = seeded().await;
    let first = json_of(&harness.get("/admin/api/session", Some(&cookie)).await.body);
    let second = json_of(&harness.get("/admin/api/session", Some(&cookie)).await.body);
    assert_eq!(first["login"], "alice");
    assert!(!first["csrf"].as_str().unwrap_or_default().is_empty());
    assert_eq!(first["csrf"], second["csrf"]);
}

#[tokio::test]
async fn the_list_is_every_report_newest_first() {
    let (harness, cookie) = seeded().await;
    let reply = harness.get("/admin/api/reports", Some(&cookie)).await;
    assert_eq!(reply.status, StatusCode::OK);
    assert_eq!(
        json_of(&reply.body),
        json_of(include_str!("../fixtures/reports.json"))
    );
}

async fn seeded_with_reports(total: u64) -> (Harness, String) {
    let (harness, cookie) = seeded().await;
    for number in 0..total.saturating_sub(3) {
        let code = format!("R-{:04}-{:04}", 5000 + number, 5000 + number);
        harness.relay.add_report(
            &code,
            1_600_000_000 + number,
            &json!({ "kind": "received" }),
            "linux",
            "1.0.0",
        );
    }
    (harness, cookie)
}

#[tokio::test]
async fn the_list_asks_the_relay_for_its_newest_500() {
    let (harness, cookie) = seeded().await;
    harness.get("/admin/api/reports", Some(&cookie)).await;
    let asked = harness
        .relay
        .requests()
        .into_iter()
        .find(|seen| seen.path == "/admin/v1/reports")
        .unwrap();
    assert_eq!(asked.query["limit"], "500");
    assert!(asked.authorized);
}

#[tokio::test]
async fn a_list_below_the_limit_is_not_marked_truncated() {
    let (harness, cookie) = seeded_with_reports(LIST_LIMIT - 1).await;
    let list = json_of(&harness.get("/admin/api/reports", Some(&cookie)).await.body);
    assert_eq!(list["truncated"], false);
    assert_eq!(
        list["reports"].as_array().unwrap().len() as u64,
        LIST_LIMIT - 1
    );
}

#[tokio::test]
async fn a_list_at_the_limit_may_hold_more() {
    let (harness, cookie) = seeded_with_reports(LIST_LIMIT).await;
    let list = json_of(&harness.get("/admin/api/reports", Some(&cookie)).await.body);
    assert_eq!(list["truncated"], true);
    assert_eq!(list["reports"].as_array().unwrap().len() as u64, LIST_LIMIT);
}

#[tokio::test]
async fn a_report_comes_with_its_text_and_audit_trail() {
    let (harness, cookie) = seeded_with_audit().await;
    let reply = harness
        .get(&format!("/admin/api/reports/{SECOND}"), Some(&cookie))
        .await;
    assert_eq!(reply.status, StatusCode::OK);
    assert_eq!(
        json_of(&reply.body),
        json_of(include_str!("../fixtures/report.json"))
    );
}

#[tokio::test]
async fn a_report_whose_text_was_purged_has_no_text() {
    let (harness, cookie) = seeded_with_audit().await;
    harness.relay.purge_report_text(SECOND);
    let reply = harness
        .get(&format!("/admin/api/reports/{SECOND}"), Some(&cookie))
        .await;
    assert_eq!(
        json_of(&reply.body),
        json_of(include_str!("../fixtures/report-purged.json"))
    );
}

#[tokio::test]
async fn the_reply_address_is_never_asked_for_and_never_returned() {
    let (harness, cookie) = seeded().await;
    harness.relay.leak_reply_address();
    for path in all_routes() {
        let reply = harness.get(&path, Some(&cookie)).await;
        assert!(!reply.body.contains(LEAKED_ADDRESS), "{path}");
        assert!(
            !reply.body.to_lowercase().contains("replyaddress"),
            "{path}"
        );
    }
    for seen in harness.relay.requests() {
        assert!(!seen.query.contains_key("replyAddress"), "{}", seen.path);
    }
}

#[tokio::test]
async fn an_unknown_report_is_a_404() {
    let (harness, cookie) = seeded().await;
    let reply = harness
        .get("/admin/api/reports/R-9999-9999", Some(&cookie))
        .await;
    assert_eq!(reply.status, StatusCode::NOT_FOUND);
    assert_eq!(json_of(&reply.body), json!({ "error": "notFound" }));
}

#[tokio::test]
async fn a_malformed_code_is_a_json_404_that_never_reaches_the_relay() {
    let (harness, cookie) = seeded().await;
    for code in ["..%2Fsecrets", "%FF", "r-2222-2222", "R-2222-2222%0A"] {
        for path in [
            format!("/admin/api/reports/{code}"),
            format!("/admin/api/reports/{code}/issue"),
        ] {
            let reply = harness.get(&path, Some(&cookie)).await;
            assert_eq!(reply.status, StatusCode::NOT_FOUND, "{path}");
            assert_eq!(
                json_of(&reply.body),
                json!({ "error": "notFound" }),
                "{path}"
            );
        }
    }
    assert!(harness.relay.requests().is_empty());
}

#[tokio::test]
async fn an_unknown_path_under_the_api_is_a_json_404() {
    let (harness, cookie) = seeded().await;
    for path in ["/admin/api/nope", "/admin/api/", "/admin/api/reports/a/b/c"] {
        let reply = harness.get(path, Some(&cookie)).await;
        assert_eq!(reply.status, StatusCode::NOT_FOUND, "{path}");
        assert_eq!(
            json_of(&reply.body),
            json!({ "error": "notFound" }),
            "{path}"
        );
    }
}

#[tokio::test]
async fn a_wrong_method_under_the_api_is_a_json_405() {
    let (harness, cookie) = seeded().await;
    let reply = harness
        .post_form("/admin/api/reports", Some(&cookie), "")
        .await;
    assert_eq!(reply.status, StatusCode::METHOD_NOT_ALLOWED);
    assert_eq!(json_of(&reply.body), json!({ "error": "methodNotAllowed" }));
}

#[tokio::test]
async fn a_relay_that_refuses_is_a_502() {
    let (harness, cookie) = seeded().await;
    harness.relay.reject_everything();
    for path in &all_routes()[1..] {
        let reply = harness.get(path, Some(&cookie)).await;
        assert_eq!(reply.status, StatusCode::BAD_GATEWAY, "{path}");
        assert_eq!(
            json_of(&reply.body),
            json!({ "error": "relayUnavailable" }),
            "{path}"
        );
    }
}

#[tokio::test]
async fn the_public_issue_text_is_what_the_relay_exports() {
    let (harness, cookie) = seeded().await;
    harness.relay.answer_export_with(json!({
        "result": "ready",
        "body": "**Report R-2222-2222**\n\nFull text of R-2222-2222",
    }));
    let reply = harness
        .get(&format!("/admin/api/reports/{SECOND}/issue"), Some(&cookie))
        .await;
    assert_eq!(reply.status, StatusCode::OK);
    assert_eq!(
        json_of(&reply.body),
        json_of(include_str!("../fixtures/issue.json"))
    );
}

#[tokio::test]
async fn a_purged_report_has_no_issue_text() {
    let (harness, cookie) = seeded().await;
    harness
        .relay
        .answer_export_with(json!({ "result": "purged" }));
    let reply = harness
        .get(&format!("/admin/api/reports/{SECOND}/issue"), Some(&cookie))
        .await;
    assert_eq!(reply.status, StatusCode::OK);
    assert_eq!(
        json_of(&reply.body),
        json_of(include_str!("../fixtures/issue-purged.json"))
    );
}

#[tokio::test]
async fn an_export_the_relay_does_not_know_is_a_404() {
    let (harness, cookie) = seeded().await;
    harness
        .relay
        .answer_export_with(json!({ "result": "notFound" }));
    let reply = harness
        .get(&format!("/admin/api/reports/{FIRST}/issue"), Some(&cookie))
        .await;
    assert_eq!(reply.status, StatusCode::NOT_FOUND);
}

fn assert_json_and_hardened(reply: &Reply, label: &str) {
    assert_eq!(
        reply.headers[header::CONTENT_TYPE],
        "application/json",
        "{label}"
    );
    assert_eq!(reply.headers[header::CACHE_CONTROL], "no-store", "{label}");
    assert_eq!(
        reply.headers[header::X_CONTENT_TYPE_OPTIONS],
        "nosniff",
        "{label}"
    );
    assert_eq!(
        reply.headers[header::REFERRER_POLICY],
        "no-referrer",
        "{label}"
    );
    assert_eq!(reply.headers[header::X_FRAME_OPTIONS], "DENY", "{label}");
    assert!(
        reply.headers.contains_key(header::CONTENT_SECURITY_POLICY),
        "{label}"
    );
}

#[tokio::test]
async fn every_answer_is_json_and_carries_the_hardening_headers() {
    let (harness, cookie) = seeded().await;
    for session in [None, Some(cookie.as_str())] {
        for path in all_routes() {
            let reply = harness.get(&path, session).await;
            assert_json_and_hardened(&reply, &path);
        }
    }
    let unknown = harness.get("/admin/api/nope", Some(&cookie)).await;
    assert_json_and_hardened(&unknown, "unknown path");
    let wrong_method = harness
        .post_form("/admin/api/reports", Some(&cookie), "")
        .await;
    assert_json_and_hardened(&wrong_method, "wrong method");
    harness.relay.reject_everything();
    let refused = harness.get("/admin/api/reports", Some(&cookie)).await;
    assert_json_and_hardened(&refused, "relay refused");
}
