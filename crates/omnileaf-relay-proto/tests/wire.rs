use omnileaf_relay_proto::{
    ChallengeId, ErrorBody, ErrorCode, Platform, Proof, ReportStatus, ReportSubmission, StatusKey,
    StatusLookups, StatusReplies, StatusReply,
};
use serde_json::{Value, json};

fn submission() -> ReportSubmission {
    ReportSubmission {
        code: "R-7K2M-QX9D".to_owned(),
        platform: Platform::Android,
        version: "0.1.0".to_owned(),
        report: "Report code: R-7K2M-QX9D\n".to_owned(),
        reply_to: None,
        status_key_hash: StatusKey::from_bytes([3; 32]).hash(),
        proof: Proof {
            challenge: ChallengeId::from_bytes([1; 16]),
            nonce: 42,
        },
    }
}

#[test]
fn sends_a_report_with_exactly_its_documented_keys() {
    let json = serde_json::to_value(submission()).unwrap();

    let mut keys: Vec<&str> = json
        .as_object()
        .unwrap()
        .keys()
        .map(String::as_str)
        .collect();
    keys.sort_unstable();

    assert_eq!(
        keys,
        [
            "code",
            "platform",
            "proof",
            "replyTo",
            "report",
            "statusKeyHash",
            "version"
        ]
    );
    assert_eq!(json["replyTo"], Value::Null);
    assert_eq!(json["platform"], "android");
    assert_eq!(
        json["proof"],
        json!({ "challenge": "AQEBAQEBAQEBAQEBAQEBAQ", "nonce": 42 })
    );
}

#[test]
fn refuses_a_report_with_an_unknown_field() {
    let mut json = serde_json::to_value(submission()).unwrap();
    json["deviceId"] = json!("anything");

    let parsed: Result<ReportSubmission, _> = serde_json::from_value(json);

    assert!(parsed.is_err());
}

#[test]
fn reads_and_writes_each_status() {
    let replies = StatusReplies {
        reports: vec![
            StatusReply {
                code: "R-0000-0001".to_owned(),
                status: ReportStatus::Received,
            },
            StatusReply {
                code: "R-0000-0002".to_owned(),
                status: ReportStatus::Published { issue: 412 },
            },
            StatusReply {
                code: "R-0000-0003".to_owned(),
                status: ReportStatus::Duplicate { issue: 97 },
            },
            StatusReply {
                code: "R-0000-0004".to_owned(),
                status: ReportStatus::Unknown,
            },
        ],
    };

    let json = serde_json::to_value(&replies).unwrap();
    let read: StatusReplies = serde_json::from_value(json.clone()).unwrap();

    assert_eq!(
        json["reports"][1],
        json!({ "code": "R-0000-0002", "status": "published", "issue": 412 })
    );
    assert_eq!(
        json["reports"][2],
        json!({ "code": "R-0000-0003", "status": "duplicate", "issue": 97 })
    );
    assert_eq!(
        json["reports"][0],
        json!({ "code": "R-0000-0001", "status": "received" })
    );
    assert_eq!(read, replies);
}

#[test]
fn keeps_status_keys_out_of_debug_output() {
    let lookups: StatusLookups = serde_json::from_value(json!({
        "reports": [{ "code": "R-0000-0001", "statusKey": StatusKey::from_bytes([9; 32]).to_text() }]
    }))
    .unwrap();

    let printed = format!("{lookups:?}");

    assert!(!printed.contains("CQkJ"));
}

#[test]
fn reads_an_error_code_it_does_not_know() {
    let body: ErrorBody = serde_json::from_value(json!({
        "error": { "code": "somethingNew", "message": "A new failure." }
    }))
    .unwrap();

    assert_eq!(body.error.code, ErrorCode::Unrecognised);
}

#[test]
fn reads_a_status_it_does_not_know_as_unknown() {
    let replies: StatusReplies = serde_json::from_value(json!({
        "reports": [
            { "code": "R-0000-0001", "status": "somethingNew" },
            { "code": "R-0000-0002", "status": "received" }
        ]
    }))
    .unwrap();

    assert_eq!(replies.reports[0].status, ReportStatus::Unknown);
    assert_eq!(replies.reports[1].status, ReportStatus::Received);
}
