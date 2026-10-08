#![expect(
    clippy::unwrap_used,
    clippy::indexing_slicing,
    reason = "decoding is a test helper, so malformed input should stop the test"
)]

use std::collections::BTreeMap;

use omnileaf_engine::{
    CrashReport, CrashReportId, CrashedApp, InterfaceError, PanicDetails, Platform, ProjectLink,
};
use proptest::prelude::*;

const BROWSER_URL_LIMIT: usize = 8000;

fn app() -> CrashedApp {
    CrashedApp {
        version: "1.2.3".to_owned(),
        platform: Platform::Macos,
        system: Some("Sample OS 4.5".to_owned()),
    }
}

fn interface_report(message: &str, stack: Option<&str>) -> CrashReport {
    CrashReport::from_interface_error(
        CrashReportId::from_millis(1),
        app(),
        &InterfaceError {
            message: message.to_owned(),
            stack: stack.map(str::to_owned),
        },
    )
}

fn decode(component: &str) -> String {
    let bytes = component.as_bytes();
    let mut decoded = Vec::new();
    let mut index = 0;
    while let Some(&byte) = bytes.get(index) {
        if byte == b'%' {
            let hex = std::str::from_utf8(&bytes[index + 1..index + 3]).unwrap();
            decoded.push(u8::from_str_radix(hex, 16).unwrap());
            index += 3;
        } else {
            decoded.push(byte);
            index += 1;
        }
    }
    String::from_utf8(decoded).unwrap()
}

fn fields(url: &str) -> BTreeMap<String, String> {
    let (_, query) = url.split_once('?').unwrap();
    query
        .split('&')
        .map(|pair| {
            let (name, value) = pair.split_once('=').unwrap();
            (name.to_owned(), decode(value))
        })
        .collect()
}

#[test]
fn opens_the_bug_report_form_of_the_project() {
    let report = interface_report("boom", None);

    let url = report.new_issue_url();

    assert!(url.starts_with(ProjectLink::NewIssue.url()), "{url}");
}

#[test]
fn fills_in_the_form_with_the_report_as_shown() {
    let report = interface_report("TypeError: x is undefined", Some("at turn (a.js:1:2)"));

    let fields = fields(&report.new_issue_url());

    assert_eq!(fields["title"], "Crash: TypeError: x is undefined");
    assert_eq!(fields["platform"], "macOS");
    assert_eq!(fields["version"], "1.2.3");
    assert_eq!(fields["logs"], report.to_string());
    assert!(!fields["what-happened"].is_empty());
}

#[test]
fn says_a_panic_closed_the_app() {
    let report = CrashReport::from_panic(
        CrashReportId::from_millis(1),
        app(),
        &PanicDetails {
            message: "boom",
            location: None,
            backtrace: "",
        },
    );

    let fields = fields(&report.new_issue_url());

    assert_eq!(fields["what-happened"], "Omnileaf closed unexpectedly.");
}

proptest! {
    #[test]
    fn carries_any_report_through_the_address_unchanged(
        message in "\\PC{0,300}",
        stack in "[\\PC\n]{0,400}",
    ) {
        let report = interface_report(&message, Some(&stack));

        let fields = fields(&report.new_issue_url());

        prop_assert_eq!(&fields["logs"], &report.to_string());
    }

    #[test]
    fn stays_short_enough_for_a_browser(
        message in "\\PC{0,2000}",
        stack in prop::collection::vec("[^\n]{0,400}", 0..40),
    ) {
        let report = interface_report(&message, Some(&stack.join("\n")));

        let url = report.new_issue_url();

        prop_assert!(url.len() <= BROWSER_URL_LIMIT, "{}", url.len());
    }
}
