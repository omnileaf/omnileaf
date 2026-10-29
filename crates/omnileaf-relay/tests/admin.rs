#![expect(
    clippy::unwrap_used,
    reason = "each test opens its own scratch database, so a failed set-up should stop the test"
)]

#[expect(
    dead_code,
    reason = "each test file uses the part of the harness it needs"
)]
mod support;

use omnileaf_relay::{
    Export, IntakeCaps, IssueNumber, Purged, RECORD_KEPT_AFTER_REVIEW_SECONDS, ReplyAddressView,
    ReviewStatus, StatusKind, Store, TEXT_KEPT_AFTER_REVIEW_SECONDS, TargetStatus, UnixTime,
};
use support::{START, code, draft};

const CAPS: IntakeCaps = IntakeCaps {
    reports_per_day: 100,
    pending_reports: 100,
};
const CODE: &str = "R-7K2M-QX9D";
const ADDRESS: &str = "reader@example.com";

fn store_with(codes: &[&str]) -> Store {
    let store = Store::open_in_memory().unwrap();
    for (offset, code) in (0..).zip(codes) {
        store
            .take_in(
                &draft(code)
                    .with_reply_to(ADDRESS)
                    .as_new_report(START.plus_seconds(offset)),
                CAPS,
            )
            .unwrap();
    }
    store
}

#[test]
fn lists_reports_newest_first_with_their_details() {
    let store = store_with(&[CODE, "R-0000-0001"]);

    let listed = store.list(None, 50).unwrap();

    let codes: Vec<&str> = listed.iter().map(|report| report.code.as_str()).collect();
    assert_eq!(codes, ["R-0000-0001", CODE]);
    assert_eq!(listed[0].status, ReviewStatus::Received);
    assert_eq!(listed[0].platform, "android");
    assert_eq!(listed[0].version, "0.1.0");
    assert_eq!(
        listed[1].to_string(),
        "R-7K2M-QX9D  2025-10-29 00:00 UTC  received  android  0.1.0"
    );
}

#[test]
fn lists_only_the_status_asked_for_up_to_the_limit() {
    let store = store_with(&[CODE, "R-0000-0001", "R-0000-0002"]);
    store
        .set_status(&code(CODE), TargetStatus::Reviewing, START)
        .unwrap();

    let reviewing = store.list(Some(StatusKind::Reviewing), 50).unwrap();
    let received = store.list(Some(StatusKind::Received), 1).unwrap();

    assert_eq!(reviewing.len(), 1);
    assert_eq!(reviewing[0].code, CODE);
    assert_eq!(received.len(), 1);
}

#[test]
fn shows_a_report_without_its_reply_address_unless_asked() {
    let store = store_with(&[CODE]);

    let hidden = store
        .show(&code(CODE), ReplyAddressView::Hidden)
        .unwrap()
        .unwrap();
    let shown = store
        .show(&code(CODE), ReplyAddressView::Shown)
        .unwrap()
        .unwrap();

    assert_eq!(hidden.reply_address, None);
    assert!(!hidden.to_string().contains(ADDRESS));
    assert!(hidden.to_string().contains("Nothing logged yet."));
    assert_eq!(shown.reply_address.as_deref(), Some(ADDRESS));
    assert!(shown.to_string().contains(ADDRESS));
}

#[test]
fn exports_an_issue_body_without_the_reply_address() {
    let store = store_with(&[CODE]);

    let export = store.export(&code(CODE)).unwrap();

    let Export::Ready(body) = export else {
        panic!("expected an issue body, got {export:?}");
    };
    assert!(body.contains("Report code: R-7K2M-QX9D"));
    assert!(body.contains("Nothing logged yet."));
    assert!(!body.contains(ADDRESS));
}

#[test]
fn fences_a_report_that_holds_backticks() {
    let store = Store::open_in_memory().unwrap();
    let report = format!("Report code: {CODE}\n```\nnot the end\n````\n");
    store
        .take_in(&draft(CODE).with_report(report).as_new_report(START), CAPS)
        .unwrap();

    let Export::Ready(body) = store.export(&code(CODE)).unwrap() else {
        panic!("expected an issue body");
    };

    assert!(body.contains("`````text\n"));
    assert!(body.trim_end().ends_with("`````"));
}

#[test]
fn says_when_there_is_nothing_to_export() {
    let store = Store::open_in_memory().unwrap();

    assert_eq!(store.export(&code(CODE)).unwrap(), Export::NotFound);
}

#[test]
fn drops_spent_text_and_addresses_ninety_days_after_review() {
    let store = store_with(&[CODE, "R-0000-0001"]);
    store
        .set_status(&code(CODE), TargetStatus::Closed, START)
        .unwrap();
    let just_before = START.plus_seconds(TEXT_KEPT_AFTER_REVIEW_SECONDS - 1);
    let on_time = START.plus_seconds(TEXT_KEPT_AFTER_REVIEW_SECONDS);

    let early = store.purge(just_before).unwrap();
    let due = store.purge(on_time).unwrap();

    assert_eq!(early, Purged::default());
    assert_eq!(due.report_texts, 1);
    assert_eq!(store.export(&code(CODE)).unwrap(), Export::Purged);
    let shown = store
        .show(&code(CODE), ReplyAddressView::Shown)
        .unwrap()
        .unwrap();
    assert_eq!((shown.report, shown.reply_address), (None, None));
    let waiting = store
        .show(&code("R-0000-0001"), ReplyAddressView::Shown)
        .unwrap()
        .unwrap();
    assert_eq!(waiting.reply_address.as_deref(), Some(ADDRESS));
}

#[test]
fn forgets_a_reviewed_report_a_year_after_review() {
    let store = store_with(&[CODE]);
    store
        .set_status(
            &code(CODE),
            TargetStatus::Published(IssueNumber::new(412).unwrap()),
            START,
        )
        .unwrap();

    let early = store
        .purge(START.plus_seconds(RECORD_KEPT_AFTER_REVIEW_SECONDS - 1))
        .unwrap();
    let due = store
        .purge(START.plus_seconds(RECORD_KEPT_AFTER_REVIEW_SECONDS))
        .unwrap();

    assert_eq!(early.reports, 0);
    assert_eq!(due.reports, 1);
    assert_eq!(
        store.show(&code(CODE), ReplyAddressView::Hidden).unwrap(),
        None
    );
}

#[test]
fn keeps_reports_still_waiting_for_review() {
    let store = store_with(&[CODE]);

    let purged = store
        .purge(UnixTime::from_seconds(
            START.seconds() + 2 * RECORD_KEPT_AFTER_REVIEW_SECONDS,
        ))
        .unwrap();

    assert_eq!(purged, Purged::default());
    assert!(
        store
            .show(&code(CODE), ReplyAddressView::Hidden)
            .unwrap()
            .is_some()
    );
}

#[test]
fn drops_expired_challenges() {
    let store = Store::open_in_memory().unwrap();
    store
        .issue_challenge(
            omnileaf_relay::ChallengeTerms {
                difficulty: omnileaf_relay_proto::pow::Difficulty::try_from(4).unwrap(),
                outstanding_limit: 10,
            },
            START,
        )
        .unwrap();

    let purged = store
        .purge(START.plus_seconds(omnileaf_relay::CHALLENGE_LIFETIME_SECONDS))
        .unwrap();

    assert_eq!(purged.challenges, 1);
}
