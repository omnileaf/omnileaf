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
    assert_eq!(version, 2);
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
fn marks_a_received_or_reviewed_report_as_a_duplicate() {
    let received = status_after(&[TargetStatus::Duplicate(issue(7))]);
    let reviewed = status_after(&[TargetStatus::Reviewing, TargetStatus::Duplicate(issue(7))]);

    assert_eq!(received, [StatusChange::Changed]);
    assert_eq!(reviewed, [StatusChange::Changed, StatusChange::Changed]);
}

#[test]
fn keeps_a_duplicate_a_duplicate() {
    let changes = status_after(&[
        TargetStatus::Duplicate(issue(7)),
        TargetStatus::Closed,
        TargetStatus::Reviewing,
        TargetStatus::Published(issue(8)),
        TargetStatus::Duplicate(issue(9)),
    ]);

    let duplicate = ReviewStatus::Duplicate(issue(7));
    assert_eq!(
        changes,
        [
            StatusChange::Changed,
            StatusChange::Refused { from: duplicate },
            StatusChange::Refused { from: duplicate },
            StatusChange::Refused { from: duplicate },
            StatusChange::Refused { from: duplicate },
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

const OTHER_CODE: &str = "R-2QX9-7F3K";

fn report_logging(code: &str, lines: &[&str]) -> support::Draft {
    let log = lines.join("\n");
    draft(code).with_report(format!(
        "Report code: {code}\nOmnileaf 0.1.0 on Android\nLog, names replaced:\n{log}\n"
    ))
}

fn status_of(store: &Store, code_text: &str) -> ReviewStatus {
    store
        .show(&code(code_text), omnileaf_relay::ReplyAddressView::Hidden)
        .unwrap()
        .unwrap()
        .listed
        .status
}

fn publish(store: &Store, code_text: &str, number: u64) {
    store
        .set_status(
            &code(code_text),
            TargetStatus::Published(issue(number)),
            START,
        )
        .unwrap();
}

#[test]
fn folds_a_report_into_the_issue_an_earlier_report_with_the_same_problem_became() {
    let store = Store::open_in_memory().unwrap();
    let first = report_logging(
        CODE,
        &["WARN omnileaf_engine::scan: skip a book path=<path> after 12 tries"],
    );
    store.take_in(&first.as_new_report(START), CAPS).unwrap();
    publish(&store, CODE, 412);

    let later = report_logging(
        OTHER_CODE,
        &[
            "INFO omnileaf_engine::scan: started",
            "WARN omnileaf_engine::scan: skip a book path=<path> after 31 tries",
        ],
    );
    let intake = store.take_in(&later.as_new_report(START), CAPS).unwrap();

    assert_eq!(intake, Intake::Inserted);
    assert_eq!(
        status_of(&store, OTHER_CODE),
        ReviewStatus::Duplicate(issue(412))
    );
}

#[test]
fn keeps_a_report_with_a_different_problem_as_received() {
    let store = Store::open_in_memory().unwrap();
    let first = report_logging(CODE, &["WARN omnileaf_engine::scan: skip a book"]);
    store.take_in(&first.as_new_report(START), CAPS).unwrap();
    publish(&store, CODE, 412);

    let later = report_logging(OTHER_CODE, &["ERROR omnileaf_db::catalog: disk full"]);
    store.take_in(&later.as_new_report(START), CAPS).unwrap();

    assert_eq!(status_of(&store, OTHER_CODE), ReviewStatus::Received);
}

#[test]
fn keeps_a_report_as_received_while_the_earlier_one_has_no_issue() {
    let store = Store::open_in_memory().unwrap();
    let first = report_logging(CODE, &["WARN omnileaf_engine::scan: skip a book"]);
    store.take_in(&first.as_new_report(START), CAPS).unwrap();

    let later = report_logging(OTHER_CODE, &["WARN omnileaf_engine::scan: skip a book"]);
    store.take_in(&later.as_new_report(START), CAPS).unwrap();

    assert_eq!(status_of(&store, OTHER_CODE), ReviewStatus::Received);
}

#[test]
fn keeps_a_report_with_nothing_but_info_lines_as_received() {
    let store = Store::open_in_memory().unwrap();
    let first = report_logging(CODE, &["INFO omnileaf_engine::scan: started"]);
    store.take_in(&first.as_new_report(START), CAPS).unwrap();
    publish(&store, CODE, 412);

    let later = report_logging(OTHER_CODE, &["INFO omnileaf_engine::scan: started"]);
    store.take_in(&later.as_new_report(START), CAPS).unwrap();

    assert_eq!(status_of(&store, OTHER_CODE), ReviewStatus::Received);
}

#[test]
fn keeps_the_same_problem_on_another_platform_as_received() {
    let store = Store::open_in_memory().unwrap();
    let first = report_logging(CODE, &["WARN omnileaf_engine::scan: skip a book"]);
    store.take_in(&first.as_new_report(START), CAPS).unwrap();
    publish(&store, CODE, 412);

    let mut later = report_logging(OTHER_CODE, &["WARN omnileaf_engine::scan: skip a book"]);
    later.platform = omnileaf_relay_proto::Platform::Linux;
    store.take_in(&later.as_new_report(START), CAPS).unwrap();

    assert_eq!(status_of(&store, OTHER_CODE), ReviewStatus::Received);
}
