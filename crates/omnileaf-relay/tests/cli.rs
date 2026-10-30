#![expect(
    clippy::unwrap_used,
    reason = "each test runs the relay on its own scratch database, so a failed set-up should stop the test"
)]

#[expect(
    dead_code,
    reason = "each test file uses the part of the harness it needs"
)]
mod support;

use std::{path::Path, process::Output};

use omnileaf_relay::{IntakeCaps, Store};
use omnileaf_testkit::ScratchFolder;
use support::{START, draft};

const CODE: &str = "R-7K2M-QX9D";
const ADDRESS: &str = "reader@example.com";

fn relay_command(database: &Path, arguments: &[&str]) -> Output {
    std::process::Command::new(env!("CARGO_BIN_EXE_omnileaf-relay"))
        .env("RELAY_DATABASE", database)
        .args(arguments)
        .output()
        .unwrap()
}

fn database_with_report(folder: &ScratchFolder) -> std::path::PathBuf {
    let path = folder.path().join("relay.sqlite3");
    Store::open(&path)
        .unwrap()
        .take_in(
            &draft(CODE).with_reply_to(ADDRESS).as_new_report(START),
            IntakeCaps {
                reports_per_day: 10,
                pending_reports: 10,
            },
        )
        .unwrap();
    path
}

fn stdout(output: &Output) -> String {
    String::from_utf8_lossy(&output.stdout).into_owned()
}

#[test]
fn lists_the_reports_waiting_for_review() {
    let folder = ScratchFolder::new("relay-cli-list");
    let database = database_with_report(&folder);

    let output = relay_command(&database, &["reports", "list", "--status", "received"]);

    assert!(output.status.success());
    assert!(stdout(&output).starts_with(CODE));
}

#[test]
fn shows_the_reply_address_only_when_asked() {
    let folder = ScratchFolder::new("relay-cli-show");
    let database = database_with_report(&folder);

    let hidden = relay_command(&database, &["reports", "show", CODE]);
    let shown = relay_command(&database, &["reports", "show", CODE, "--reply-address"]);

    assert!(!stdout(&hidden).contains(ADDRESS));
    assert!(stdout(&shown).contains(ADDRESS));
}

#[test]
fn publishes_a_report_only_with_its_issue() {
    let folder = ScratchFolder::new("relay-cli-publish");
    let database = database_with_report(&folder);

    let without_issue = relay_command(&database, &["reports", "set-status", CODE, "published"]);
    let with_issue = relay_command(
        &database,
        &["reports", "set-status", CODE, "published", "--issue", "412"],
    );
    let listed = relay_command(&database, &["reports", "list"]);

    assert!(!without_issue.status.success());
    assert!(with_issue.status.success());
    assert!(stdout(&listed).contains("published #412"));
}

#[test]
fn marks_a_report_as_a_duplicate_only_with_its_issue() {
    let folder = ScratchFolder::new("relay-cli-duplicate");
    let database = database_with_report(&folder);

    let without_issue = relay_command(&database, &["reports", "set-status", CODE, "duplicate"]);
    let with_issue = relay_command(
        &database,
        &["reports", "set-status", CODE, "duplicate", "--issue", "97"],
    );
    let listed = relay_command(&database, &["reports", "list", "--status", "duplicate"]);

    assert!(!without_issue.status.success());
    assert!(with_issue.status.success());
    assert!(stdout(&listed).contains("duplicate of #97"));
}

#[test]
fn refuses_an_issue_for_any_other_status() {
    let folder = ScratchFolder::new("relay-cli-issue");
    let database = database_with_report(&folder);

    let output = relay_command(
        &database,
        &["reports", "set-status", CODE, "closed", "--issue", "412"],
    );

    assert!(!output.status.success());
}

#[test]
fn refuses_a_move_the_review_does_not_allow() {
    let folder = ScratchFolder::new("relay-cli-refused");
    let database = database_with_report(&folder);
    relay_command(&database, &["reports", "set-status", CODE, "reviewing"]);

    let output = relay_command(&database, &["reports", "set-status", CODE, "reviewing"]);

    assert!(!output.status.success());
}

#[test]
fn exports_an_issue_body_without_the_reply_address() {
    let folder = ScratchFolder::new("relay-cli-export");
    let database = database_with_report(&folder);

    let output = relay_command(&database, &["reports", "export", CODE]);

    assert!(output.status.success());
    assert!(stdout(&output).contains(&format!("Report code: {CODE}")));
    assert!(!stdout(&output).contains(ADDRESS));
}

#[test]
fn says_when_a_code_has_no_report() {
    let folder = ScratchFolder::new("relay-cli-missing");
    let database = database_with_report(&folder);

    let shown = relay_command(&database, &["reports", "show", "R-0000-0001"]);
    let exported = relay_command(&database, &["reports", "export", "R-0000-0001"]);
    let malformed = relay_command(&database, &["reports", "show", "R-0000"]);

    assert!(!shown.status.success());
    assert!(!exported.status.success());
    assert!(!malformed.status.success());
}

#[test]
fn purges_on_demand() {
    let folder = ScratchFolder::new("relay-cli-purge");
    let database = database_with_report(&folder);

    let output = relay_command(&database, &["reports", "purge"]);

    assert!(output.status.success());
    assert!(stdout(&output).starts_with("Removed 0 challenges"));
}

#[test]
fn fails_its_health_check_when_nothing_listens() {
    let folder = ScratchFolder::new("relay-cli-health");
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap().to_string();
    drop(listener);

    let output = relay_command(
        &folder.path().join("unused.sqlite3"),
        &["health", "--listen", &address],
    );

    assert!(!output.status.success());
}
