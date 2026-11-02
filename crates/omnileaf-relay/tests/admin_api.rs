#![expect(
    clippy::unwrap_used,
    reason = "the harness builds fixed requests, so a failed set-up should stop the test"
)]

#[expect(
    dead_code,
    reason = "each test file uses the part of the harness it needs"
)]
mod support;

use axum::{
    body::Body,
    http::{Method, Request, StatusCode},
};
use omnileaf_relay::{AdminToken, AdminTokenTooShort, IntakeCaps};
use serde_json::{Value, json};
use support::{ADMIN_TOKEN, Answer, START, TestRelay, admin_relay, draft, relay};

const CODE: &str = "R-7K2M-QX9D";
const OTHER_CODE: &str = "R-2B3C-4D5E";
const ADDRESS: &str = "reader@example.com";
const CAPS: IntakeCaps = IntakeCaps {
    reports_per_day: 100,
    pending_reports: 100,
};

fn seeded() -> TestRelay {
    let relay = admin_relay();
    for (offset, code) in (0..).zip([CODE, OTHER_CODE]) {
        relay
            .store
            .take_in(
                &draft(code)
                    .with_reply_to(ADDRESS)
                    .as_new_report(START.plus_seconds(offset)),
                CAPS,
            )
            .unwrap();
    }
    relay
}

impl TestRelay {
    async fn admin(&self, method: Method, path: &str, body: Option<Value>) -> Answer {
        self.admin_as(method, path, body, Some("maintainer")).await
    }

    async fn admin_as(
        &self,
        method: Method,
        path: &str,
        body: Option<Value>,
        actor: Option<&str>,
    ) -> Answer {
        let mut request = Request::builder()
            .method(method)
            .uri(path)
            .header("authorization", format!("Bearer {ADMIN_TOKEN}"));
        if let Some(actor) = actor {
            request = request.header("x-admin-actor", actor);
        }
        self.send(match body {
            Some(body) => request
                .header("content-type", "application/json")
                .body(Body::from(body.to_string()))
                .unwrap(),
            None => request.body(Body::empty()).unwrap(),
        })
        .await
    }

    async fn admin_get(&self, path: &str) -> Answer {
        self.admin(Method::GET, path, None).await
    }

    async fn admin_set_status(&self, code: &str, body: Value) -> Answer {
        self.admin(
            Method::POST,
            &format!("/admin/v1/reports/{code}/status"),
            Some(body),
        )
        .await
    }
}

#[test]
fn refuses_a_token_under_32_bytes() {
    assert_eq!(
        AdminToken::new(&"x".repeat(31)).err(),
        Some(AdminTokenTooShort)
    );
    assert!(AdminToken::new(&"x".repeat(32)).is_ok());
    assert!(AdminToken::new("").is_err());
}

#[tokio::test]
async fn answers_401_with_no_body_without_the_token() {
    let relay = seeded();

    for path in ["/admin/v1/reports", &format!("/admin/v1/reports/{CODE}")] {
        let answer = relay
            .send(Request::get(path).body(Body::empty()).unwrap())
            .await;

        assert_eq!(answer.status, StatusCode::UNAUTHORIZED);
        assert_eq!(answer.body, Value::Null);
    }
}

#[tokio::test]
async fn answers_401_with_no_body_for_a_wrong_token() {
    let relay = seeded();

    for header in [
        format!("Bearer {ADMIN_TOKEN}x"),
        ADMIN_TOKEN.to_owned(),
        "Bearer ".to_owned(),
        format!("Basic {ADMIN_TOKEN}"),
    ] {
        let answer = relay
            .send(
                Request::get("/admin/v1/reports")
                    .header("authorization", header)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await;

        assert_eq!(answer.status, StatusCode::UNAUTHORIZED);
        assert_eq!(answer.body, Value::Null);
    }
}

#[tokio::test]
async fn answers_401_for_a_status_change_without_the_token_and_changes_nothing() {
    let relay = seeded();

    let answer = relay
        .send(
            Request::post(format!("/admin/v1/reports/{CODE}/status"))
                .header("content-type", "application/json")
                .header("x-admin-actor", "maintainer")
                .body(Body::from(json!({ "status": "reviewing" }).to_string()))
                .unwrap(),
        )
        .await;

    assert_eq!(answer.status, StatusCode::UNAUTHORIZED);
    assert!(
        relay
            .store
            .audit_trail(&support::code(CODE))
            .unwrap()
            .is_empty()
    );
}

#[tokio::test]
async fn lists_reports_newest_first_and_filters_by_status() {
    let relay = seeded();
    relay
        .admin_set_status(CODE, json!({ "status": "reviewing" }))
        .await;

    let all = relay.admin_get("/admin/v1/reports").await;
    let reviewing = relay.admin_get("/admin/v1/reports?status=reviewing").await;
    let limited = relay.admin_get("/admin/v1/reports?limit=1").await;

    assert_eq!(all.status, StatusCode::OK);
    assert_eq!(
        all.body,
        json!([
            { "code": OTHER_CODE, "receivedAt": START.seconds() + 1,
              "status": { "kind": "received" }, "platform": "android", "version": "0.1.0" },
            { "code": CODE, "receivedAt": START.seconds(),
              "status": { "kind": "reviewing" }, "platform": "android", "version": "0.1.0" },
        ])
    );
    assert_eq!(reviewing.body.as_array().unwrap().len(), 1);
    assert_eq!(reviewing.body[0]["code"], CODE);
    assert_eq!(limited.body.as_array().unwrap().len(), 1);
}

#[tokio::test]
async fn rejects_an_unknown_status_filter() {
    let answer = seeded().admin_get("/admin/v1/reports?status=lost").await;

    assert_eq!(answer.status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn shows_a_report_without_its_reply_address_by_default() {
    let relay = seeded();

    let hidden = relay.admin_get(&format!("/admin/v1/reports/{CODE}")).await;
    let explicit = relay
        .admin_get(&format!("/admin/v1/reports/{CODE}?replyAddress=false"))
        .await;

    for answer in [hidden, explicit] {
        assert_eq!(answer.status, StatusCode::OK);
        assert_eq!(answer.body["listed"]["code"], CODE);
        assert_eq!(answer.body["replyAddress"], Value::Null);
        assert!(
            answer.body["report"]
                .as_str()
                .unwrap()
                .contains("Nothing logged yet.")
        );
        assert!(!answer.body.to_string().contains(ADDRESS));
    }
}

#[tokio::test]
async fn shows_the_reply_address_when_asked() {
    let answer = seeded()
        .admin_get(&format!("/admin/v1/reports/{CODE}?replyAddress=true"))
        .await;

    assert_eq!(answer.body["replyAddress"], ADDRESS);
}

#[tokio::test]
async fn answers_404_for_an_unknown_report() {
    let answer = seeded().admin_get("/admin/v1/reports/R-ZZZZ-ZZZZ").await;

    assert_eq!(answer.status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn changes_a_status_and_records_who_did_it() {
    let relay = seeded();

    let answer = relay
        .admin_set_status(CODE, json!({ "status": "reviewing" }))
        .await;
    let listed = relay.admin_get(&format!("/admin/v1/reports/{CODE}")).await;

    assert_eq!(answer.status, StatusCode::OK);
    assert_eq!(answer.body, json!({ "result": "changed" }));
    assert_eq!(
        listed.body["listed"]["status"],
        json!({ "kind": "reviewing" })
    );
}

#[tokio::test]
async fn publishes_a_report_with_its_issue() {
    let relay = seeded();
    relay
        .admin_set_status(CODE, json!({ "status": "reviewing" }))
        .await;

    let answer = relay
        .admin_set_status(CODE, json!({ "status": "published", "issue": 42 }))
        .await;
    let shown = relay.admin_get(&format!("/admin/v1/reports/{CODE}")).await;

    assert_eq!(answer.body, json!({ "result": "changed" }));
    assert_eq!(
        shown.body["listed"]["status"],
        json!({ "kind": "published", "issue": 42 })
    );
}

#[tokio::test]
async fn refuses_a_move_the_review_does_not_allow() {
    let relay = seeded();
    relay
        .admin_set_status(CODE, json!({ "status": "closed" }))
        .await;

    let answer = relay
        .admin_set_status(CODE, json!({ "status": "published", "issue": 7 }))
        .await;

    assert_eq!(answer.status, StatusCode::OK);
    assert_eq!(
        answer.body,
        json!({ "result": "refused", "from": "closed" })
    );
}

#[tokio::test]
async fn answers_not_found_for_a_change_to_an_unknown_report() {
    let answer = seeded()
        .admin_set_status("R-ZZZZ-ZZZZ", json!({ "status": "reviewing" }))
        .await;

    assert_eq!(answer.body, json!({ "result": "notFound" }));
}

#[tokio::test]
async fn rejects_an_issue_that_does_not_fit_the_status() {
    let relay = seeded();

    for body in [
        json!({ "status": "published" }),
        json!({ "status": "duplicate" }),
        json!({ "status": "published", "issue": 0 }),
        json!({ "status": "reviewing", "issue": 5 }),
        json!({ "status": "closed", "issue": 5 }),
        json!({ "status": "received" }),
    ] {
        let answer = relay.admin_set_status(CODE, body.clone()).await;

        assert_eq!(answer.status, StatusCode::BAD_REQUEST, "{body}");
    }
    assert!(
        relay
            .store
            .audit_trail(&support::code(CODE))
            .unwrap()
            .is_empty()
    );
}

#[tokio::test]
async fn requires_an_actor_to_change_a_status() {
    let relay = seeded();

    for actor in [None, Some(""), Some("  ")] {
        let answer = relay
            .admin_as(
                Method::POST,
                &format!("/admin/v1/reports/{CODE}/status"),
                Some(json!({ "status": "reviewing" })),
                actor,
            )
            .await;

        assert_eq!(answer.status, StatusCode::BAD_REQUEST, "{actor:?}");
    }
    assert!(
        relay
            .store
            .audit_trail(&support::code(CODE))
            .unwrap()
            .is_empty()
    );
}

#[tokio::test]
async fn exports_a_report_as_an_issue_body() {
    let relay = seeded();

    let answer = relay
        .admin_get(&format!("/admin/v1/reports/{CODE}/export"))
        .await;
    let missing = relay
        .admin_get("/admin/v1/reports/R-ZZZZ-ZZZZ/export")
        .await;

    assert_eq!(answer.body["result"], "ready");
    assert!(
        answer.body["body"]
            .as_str()
            .unwrap()
            .contains("Nothing logged yet.")
    );
    assert!(!answer.body.to_string().contains(ADDRESS));
    assert_eq!(missing.body, json!({ "result": "notFound" }));
}

#[tokio::test]
async fn reports_an_export_whose_text_was_removed_as_purged() {
    let relay = seeded();
    relay
        .admin_set_status(CODE, json!({ "status": "closed" }))
        .await;
    relay
        .store
        .purge(START.plus_seconds(100 * 24 * 60 * 60))
        .unwrap();

    let answer = relay
        .admin_get(&format!("/admin/v1/reports/{CODE}/export"))
        .await;

    assert_eq!(answer.body, json!({ "result": "purged" }));
}

#[tokio::test]
async fn lists_the_audit_trail_newest_first() {
    let relay = seeded();
    relay
        .admin_set_status(CODE, json!({ "status": "reviewing" }))
        .await;
    relay.clock.advance(60);
    relay
        .admin_set_status(CODE, json!({ "status": "duplicate", "issue": 9 }))
        .await;

    let answer = relay
        .admin_get(&format!("/admin/v1/reports/{CODE}/audit"))
        .await;

    assert_eq!(
        answer.body,
        json!([
            { "previous": "reviewing", "status": { "kind": "duplicate", "issue": 9 },
              "actor": "maintainer", "at": START.seconds() + 60 },
            { "previous": "received", "status": { "kind": "reviewing" },
              "actor": "maintainer", "at": START.seconds() },
        ])
    );
}

#[tokio::test]
async fn leaves_the_admin_paths_off_the_public_router() {
    let public = relay();

    for path in ["/admin/v1/reports", &format!("/admin/v1/reports/{CODE}")] {
        let answer = public
            .send(Request::get(path).body(Body::empty()).unwrap())
            .await;

        assert_eq!(answer.status, StatusCode::NOT_FOUND);
    }
}
