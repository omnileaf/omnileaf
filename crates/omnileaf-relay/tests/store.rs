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
    Intake, IntakeCaps, IssueNumber, ReviewStatus, StatusChange, Store, StoreError, TargetStatus,
};
use omnileaf_testkit::ScratchFolder;
use rusqlite::Connection;
use support::{START, code, draft};

const CAPS: IntakeCaps = IntakeCaps {
    reports_per_day: 100,
    pending_reports: 100,
};
const CODE: &str = "R-7K2M-QX9D";

fn issue(number: u64) -> IssueNumber {
    IssueNumber::new(number).unwrap()
}

fn store_with_report() -> Store {
    let store = Store::open_in_memory().unwrap();
    store
        .take_in(&draft(CODE).as_new_report(START), CAPS)
        .unwrap();
    store
}

fn status_after(steps: &[TargetStatus]) -> Vec<StatusChange> {
    let store = store_with_report();
    steps
        .iter()
        .map(|target| store.set_status(&code(CODE), *target, START).unwrap())
        .collect()
}

#[test]
fn creates_its_schema_in_an_empty_file() {
    let folder = ScratchFolder::new("relay-schema");
    let path = folder.path().join("relay.sqlite3");

    Store::open(&path).unwrap();

    let version: i64 = Connection::open(&path)
        .unwrap()
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .unwrap();
    assert_eq!(version, 1);
}

#[test]
fn opens_a_database_it_already_made() {
    let folder = ScratchFolder::new("relay-reopen");
    let path = folder.path().join("relay.sqlite3");
    Store::open(&path)
        .unwrap()
        .take_in(&draft(CODE).as_new_report(START), CAPS)
        .unwrap();

    let reopened = Store::open(&path).unwrap();

    assert!(
        reopened
            .is_already_received(&draft(CODE).as_new_report(START))
            .unwrap()
    );
}

#[test]
fn refuses_a_database_from_a_newer_relay() {
    let folder = ScratchFolder::new("relay-newer");
    let path = folder.path().join("relay.sqlite3");
    Connection::open(&path)
        .unwrap()
        .pragma_update(None, "user_version", 99)
        .unwrap();

    let opened = Store::open(&path);

    assert!(matches!(opened, Err(StoreError::NewerSchema { found: 99 })));
}

#[test]
fn tells_a_repeat_of_the_same_report_from_a_taken_code() {
    let store = store_with_report();

    let repeat = store
        .take_in(&draft(CODE).as_new_report(START), CAPS)
        .unwrap();
    let other = store
        .take_in(&draft(CODE).with_status_key(8).as_new_report(START), CAPS)
        .unwrap();

    assert_eq!(repeat, Intake::AlreadyReceived);
    assert_eq!(other, Intake::CodeTaken);
}

#[test]
fn moves_a_report_through_review_to_publication() {
    let changes = status_after(&[TargetStatus::Reviewing, TargetStatus::Published(issue(412))]);

    assert_eq!(changes, [StatusChange::Changed, StatusChange::Changed]);
}

#[test]
fn publishes_or_closes_a_received_report_directly() {
    let published = status_after(&[TargetStatus::Published(issue(7))]);
    let closed = status_after(&[TargetStatus::Closed]);

    assert_eq!(published, [StatusChange::Changed]);
    assert_eq!(closed, [StatusChange::Changed]);
}

#[test]
fn reopens_a_closed_report_for_review() {
    let changes = status_after(&[TargetStatus::Closed, TargetStatus::Reviewing]);

    assert_eq!(changes, [StatusChange::Changed, StatusChange::Changed]);
}

#[test]
fn keeps_a_published_report_published() {
    let changes = status_after(&[
        TargetStatus::Published(issue(7)),
        TargetStatus::Closed,
        TargetStatus::Reviewing,
        TargetStatus::Published(issue(8)),
    ]);

    let published = ReviewStatus::Published(issue(7));
    assert_eq!(
        changes,
        [
            StatusChange::Changed,
            StatusChange::Refused { from: published },
            StatusChange::Refused { from: published },
            StatusChange::Refused { from: published },
        ]
    );
}

#[test]
fn refuses_to_review_a_report_twice() {
    let changes = status_after(&[TargetStatus::Reviewing, TargetStatus::Reviewing]);

    assert_eq!(
        changes,
        [
            StatusChange::Changed,
            StatusChange::Refused {
                from: ReviewStatus::Reviewing
            }
        ]
    );
}

#[test]
fn says_when_a_code_has_no_report() {
    let store = Store::open_in_memory().unwrap();

    let change = store
        .set_status(&code(CODE), TargetStatus::Closed, START)
        .unwrap();

    assert_eq!(change, StatusChange::NotFound);
}

#[test]
fn refuses_issue_number_zero() {
    assert_eq!(IssueNumber::new(0), None);
}
