mod support;

use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use omnileaf_relay::{CHALLENGE_LIFETIME_SECONDS, Limits};
use omnileaf_relay_proto::{
    StatusKey,
    limits::{REPLY_ADDRESS_BYTES, REPORT_BYTES, REPORT_LINES, REQUEST_BODY_BYTES, VERSION_BYTES},
};
use serde_json::{Value, json};
use support::{TEST_BITS, code, draft, error_code, relay, relay_limited};

const CODE: &str = "R-7K2M-QX9D";

fn report_of_length(code: &str, bytes: usize) -> String {
    let header = format!("Report code: {code}\n");
    format!("{header}{}", "x".repeat(bytes - header.len()))
}

fn address_of_length(bytes: usize) -> String {
    let domain = "@example.com";
    format!("{}{domain}", "a".repeat(bytes - domain.len()))
}

#[tokio::test]
async fn answers_its_health_check() {
    let relay = relay();

    let answer = relay
        .send(
            Request::get("/relay/v1/health")
                .body(Body::empty())
                .unwrap(),
        )
        .await;

    assert_eq!(answer.status, StatusCode::OK);
    assert_eq!(answer.body, json!({ "ok": true }));
}

#[tokio::test]
async fn issues_a_challenge_with_its_difficulty_and_expiry() {
    let relay = relay();

    let challenge = relay.challenge().await;

    assert_eq!(challenge.difficulty, TEST_BITS);
    assert_eq!(
        challenge.expires_at,
        support::START.seconds() + CHALLENGE_LIFETIME_SECONDS
    );
}

#[tokio::test]
async fn takes_in_a_report_with_a_solved_proof() {
    let relay = relay();

    let answer = relay
        .submit(&draft(CODE).with_reply_to("reader@example.com"))
        .await;

    assert_eq!(answer.status, StatusCode::CREATED);
    assert_eq!(answer.body, json!({ "code": CODE, "status": "received" }));
}

#[tokio::test]
async fn accepts_a_resubmission_of_the_same_report_without_a_new_challenge() {
    let relay = relay();
    let draft = draft(CODE);
    let challenge = relay.challenge().await;
    let submission = draft.solved_for(&challenge);
    relay.post("/relay/v1/reports", &submission).await;

    let again = relay.post("/relay/v1/reports", &submission).await;

    assert_eq!(again.status, StatusCode::OK);
    assert_eq!(again.body, json!({ "code": CODE, "status": "received" }));
}

#[tokio::test]
async fn refuses_a_second_report_with_the_same_code_and_another_key() {
    let relay = relay();
    relay.submit(&draft(CODE)).await;

    let answer = relay.submit(&draft(CODE).with_status_key(9)).await;

    assert_eq!(answer.status, StatusCode::CONFLICT);
    assert_eq!(error_code(&answer), "codeTaken");
}

#[tokio::test]
async fn refuses_a_spent_challenge() {
    let relay = relay();
    let challenge = relay.challenge().await;
    relay
        .post("/relay/v1/reports", &draft(CODE).solved_for(&challenge))
        .await;

    let answer = relay
        .post(
            "/relay/v1/reports",
            &draft("R-0000-0001").solved_for(&challenge),
        )
        .await;

    assert_eq!(answer.status, StatusCode::CONFLICT);
    assert_eq!(error_code(&answer), "challengeUnknown");
}

#[tokio::test]
async fn refuses_an_expired_challenge() {
    let relay = relay();
    let challenge = relay.challenge().await;
    relay.clock.advance(CHALLENGE_LIFETIME_SECONDS);

    let answer = relay
        .post("/relay/v1/reports", &draft(CODE).solved_for(&challenge))
        .await;

    assert_eq!(answer.status, StatusCode::CONFLICT);
    assert_eq!(error_code(&answer), "challengeUnknown");
}

#[tokio::test]
async fn refuses_a_proof_solved_for_other_content_and_spends_the_challenge() {
    let relay = relay();
    let challenge = relay.challenge().await;
    let sent = draft(CODE);
    let solved = draft(CODE).with_reply_to("someone@example.com");
    let nonce = (0..u64::MAX)
        .map(|offset| support::nonce_solving(&challenge, &solved) + offset)
        .find(|nonce| {
            !omnileaf_relay_proto::pow::Puzzle {
                challenge: &challenge.id,
                subject: &sent.as_new_report(support::START).body_hash,
                difficulty: omnileaf_relay_proto::pow::Difficulty::try_from(TEST_BITS).unwrap(),
            }
            .is_solved_by(*nonce)
        })
        .unwrap();

    let refused = relay
        .post("/relay/v1/reports", &sent.submission(&challenge, nonce))
        .await;
    let retried = relay
        .post("/relay/v1/reports", &sent.solved_for(&challenge))
        .await;

    assert_eq!(refused.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(error_code(&refused), "proofRejected");
    assert_eq!(error_code(&retried), "challengeUnknown");
}

#[tokio::test]
async fn refuses_a_malformed_code() {
    let relay = relay();

    let challenge = relay.challenge().await;

    let answer = relay
        .post(
            "/relay/v1/reports",
            &draft("R-7K2M").submission(&challenge, 0),
        )
        .await;

    assert_eq!(answer.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(error_code(&answer), "invalidCode");
}

#[tokio::test]
async fn refuses_a_report_that_does_not_open_with_its_code() {
    let relay = relay();
    let report = draft(CODE).with_report("Report code: R-0000-0001\n".to_owned());

    let answer = relay.submit(&report).await;

    assert_eq!(answer.status, StatusCode::BAD_REQUEST);
    assert_eq!(error_code(&answer), "badRequest");
}

#[tokio::test]
async fn takes_a_report_at_its_byte_cap_and_refuses_one_byte_more() {
    let relay = relay();
    let at_cap = draft(CODE).with_report(report_of_length(CODE, REPORT_BYTES));
    let over = draft("R-0000-0001").with_report(report_of_length("R-0000-0001", REPORT_BYTES + 1));

    let taken = relay.submit(&at_cap).await;
    let refused = relay.submit(&over).await;

    assert_eq!(taken.status, StatusCode::CREATED);
    assert_eq!(refused.status, StatusCode::PAYLOAD_TOO_LARGE);
    assert_eq!(error_code(&refused), "tooLarge");
}

#[tokio::test]
async fn takes_a_report_at_its_line_cap_and_refuses_one_line_more() {
    let relay = relay();
    let lines = |code: &str, count: usize| {
        let mut report = format!("Report code: {code}\n");
        report.push_str(&"line\n".repeat(count - 1));
        report
    };
    let at_cap = draft(CODE).with_report(lines(CODE, REPORT_LINES));
    let over = draft("R-0000-0001").with_report(lines("R-0000-0001", REPORT_LINES + 1));

    let taken = relay.submit(&at_cap).await;
    let refused = relay.submit(&over).await;

    assert_eq!(taken.status, StatusCode::CREATED);
    assert_eq!(error_code(&refused), "tooLarge");
}

#[tokio::test]
async fn refuses_a_version_over_its_cap() {
    let relay = relay();
    let mut long = draft(CODE);
    long.version = "1".repeat(VERSION_BYTES + 1);

    let answer = relay.submit(&long).await;

    assert_eq!(error_code(&answer), "tooLarge");
}

#[tokio::test]
async fn takes_a_reply_address_at_its_cap_and_refuses_one_byte_more() {
    let relay = relay();
    let at_cap = draft(CODE).with_reply_to(&address_of_length(REPLY_ADDRESS_BYTES));
    let over = draft("R-0000-0001").with_reply_to(&address_of_length(REPLY_ADDRESS_BYTES + 1));

    let taken = relay.submit(&at_cap).await;
    let refused = relay.submit(&over).await;

    assert_eq!(taken.status, StatusCode::CREATED);
    assert_eq!(refused.status, StatusCode::UNPROCESSABLE_ENTITY);
    assert_eq!(error_code(&refused), "invalidReplyAddress");
}

#[tokio::test]
async fn takes_a_body_at_its_cap_and_refuses_one_byte_more() {
    let relay = relay();
    let padded = |bytes: usize| {
        let mut body = b"{}".to_vec();
        body.splice(1..1, std::iter::repeat_n(b' ', bytes - 2));
        body
    };
    let request = |body: Vec<u8>| {
        Request::post("/relay/v1/challenges")
            .header("content-type", "application/json")
            .header("cf-connecting-ip", support::CLIENT_IP)
            .body(Body::from(body))
            .unwrap()
    };

    let at_cap = relay.send(request(padded(REQUEST_BODY_BYTES))).await;
    let over = relay.send(request(padded(REQUEST_BODY_BYTES + 1))).await;

    assert_eq!(at_cap.status, StatusCode::CREATED);
    assert_eq!(over.status, StatusCode::PAYLOAD_TOO_LARGE);
    assert_eq!(error_code(&over), "tooLarge");
}

#[tokio::test]
async fn refuses_an_unknown_field() {
    let relay = relay();
    let challenge = relay.challenge().await;
    let mut submission = draft(CODE).solved_for(&challenge);
    submission["installId"] = json!("anything");

    let answer = relay.post("/relay/v1/reports", &submission).await;

    assert_eq!(answer.status, StatusCode::BAD_REQUEST);
    assert_eq!(error_code(&answer), "badRequest");
}

#[tokio::test]
async fn refuses_a_body_that_is_not_json() {
    let relay = relay();

    let answer = relay
        .send(
            Request::post("/relay/v1/challenges")
                .header("content-type", "text/plain")
                .body(Body::from("{}"))
                .unwrap(),
        )
        .await;

    assert_eq!(answer.status, StatusCode::UNSUPPORTED_MEDIA_TYPE);
    assert_eq!(error_code(&answer), "unsupportedMediaType");
}

#[tokio::test]
async fn answers_the_status_of_a_received_report() {
    let relay = relay();
    let draft = draft(CODE);
    relay.submit(&draft).await;

    let answer = relay.statuses(&[(CODE, &draft.status_key)]).await;

    assert_eq!(answer.status, StatusCode::OK);
    assert_eq!(
        answer.body,
        json!({ "reports": [{ "code": CODE, "status": "received" }] })
    );
}

#[tokio::test]
async fn answers_a_wrong_key_the_same_as_an_unknown_code() {
    let relay = relay();
    relay.submit(&draft(CODE)).await;
    let wrong = StatusKey::from_bytes([42; 32]);

    let answer = relay
        .statuses(&[
            (CODE, &wrong),
            ("R-0000-0001", &wrong),
            ("nonsense", &wrong),
        ])
        .await;

    let statuses: Vec<&Value> = answer.body["reports"]
        .as_array()
        .unwrap()
        .iter()
        .map(|report| &report["status"])
        .collect();
    assert_eq!(
        statuses,
        [&json!("unknown"), &json!("unknown"), &json!("unknown")]
    );
}

#[tokio::test]
async fn refuses_more_status_lookups_than_its_cap() {
    let relay = relay();
    let key = StatusKey::from_bytes([1; 32]);
    let lookups: Vec<(&str, &StatusKey)> = std::iter::repeat_n((CODE, &key), 51).collect();

    let answer = relay.statuses(&lookups).await;

    assert_eq!(error_code(&answer), "tooLarge");
}

#[tokio::test]
async fn refuses_an_empty_status_lookup() {
    let relay = relay();

    let answer = relay.statuses(&[]).await;

    assert_eq!(error_code(&answer), "badRequest");
}

#[tokio::test]
async fn turns_reports_away_once_the_day_is_full() {
    let relay = relay_limited(Limits {
        reports_per_day: 1,
        ..Limits::default()
    });
    relay.submit(&draft(CODE)).await;

    let answer = relay.submit(&draft("R-0000-0001")).await;

    assert_eq!(answer.status, StatusCode::SERVICE_UNAVAILABLE);
    assert_eq!(error_code(&answer), "relayBusy");
    assert!(answer.headers.contains_key("retry-after"));
}

#[tokio::test]
async fn turns_reports_away_while_too_many_wait_for_review() {
    let relay = relay_limited(Limits {
        pending_reports: 1,
        ..Limits::default()
    });
    relay.submit(&draft(CODE)).await;
    relay.clock.advance(2 * 24 * 60 * 60);

    let answer = relay.submit(&draft("R-0000-0001")).await;

    assert_eq!(error_code(&answer), "relayBusy");
}

#[tokio::test]
async fn turns_challenges_away_while_too_many_are_outstanding() {
    let relay = relay_limited(Limits {
        outstanding_challenges: 1,
        ..Limits::default()
    });
    relay.challenge().await;

    let answer = relay.post("/relay/v1/challenges", &json!({})).await;

    assert_eq!(error_code(&answer), "relayBusy");
    assert!(answer.headers.contains_key("retry-after"));
}

#[tokio::test]
async fn keeps_the_reply_address_apart_from_the_report() {
    let relay = relay();
    relay
        .submit(&draft(CODE).with_reply_to("reader@example.com"))
        .await;

    let shown = relay
        .store
        .show(&code(CODE), omnileaf_relay::ReplyAddressView::Shown)
        .unwrap()
        .unwrap();

    assert_eq!(shown.reply_address.as_deref(), Some("reader@example.com"));
    assert!(!shown.report.unwrap().contains("reader@example.com"));
}
