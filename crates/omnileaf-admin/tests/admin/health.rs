use super::support::Harness;
use axum::http::{StatusCode, header};
use serde_json::json;

#[tokio::test]
async fn the_health_route_answers_200_without_a_session_and_shows_nothing() {
    let harness = Harness::start(&["alice"]).await;
    harness.relay.add_report(
        "R-7K2M-QX9D",
        1,
        &json!({ "kind": "received" }),
        "linux",
        "1.0.0",
    );

    let reply = harness.get("/admin/health", None).await;

    assert_eq!(reply.status, StatusCode::OK);
    assert!(reply.body.is_empty());
    assert!(reply.set_cookies().is_empty());
    assert!(reply.headers.get(header::LOCATION).is_none());
    assert!(harness.relay.requests().is_empty());
    assert_eq!(harness.github.token_requests(), 0);
}
