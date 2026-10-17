#![expect(
    clippy::unwrap_used,
    clippy::indexing_slicing,
    reason = "decoding is a test helper, so malformed input should stop the test"
)]

use std::collections::BTreeMap;

use omnileaf_engine::{
    AppInfo, BuildProfile, LogStandIns, Platform, ProblemReport, ProblemReportPreview, ProjectLink,
    ReportCode, VersionDetails,
};
use proptest::prelude::*;

const BROWSER_URL_LIMIT: usize = 8000;
const CODE: u32 = 0x000A_BCDE;

fn details() -> VersionDetails {
    VersionDetails {
        app: AppInfo {
            version: "1.2.3".to_owned(),
            platform: Platform::Linux,
            source_code: "repo.example.org/omnileaf".to_owned(),
            is_development_build: false,
        },
        build: BuildProfile::Release,
        architecture: "x86_64".to_owned(),
        system: Some("Fedora 43".to_owned()),
        webview: Some("2.50.1".to_owned()),
        runtime: "Tauri 2.12.0".to_owned(),
    }
}

fn logged() -> Vec<String> {
    vec![
        "INFO omnileaf_app: open the library".to_owned(),
        "WARN omnileaf_engine::scan: skip a book path=/home/kai/Comics/Old.cbz".to_owned(),
    ]
}

fn report_of(random: u32, lines: &[String]) -> ProblemReport {
    ProblemReport::new(
        ReportCode::from_random(random),
        details(),
        LogStandIns::default().clean_log(lines),
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
fn shows_its_code_the_version_the_system_and_the_cleaned_log() {
    let report = report_of(CODE, &logged());

    let preview = report.preview();

    assert_eq!(
        preview,
        ProblemReportPreview {
            code: ReportCode::from_random(CODE),
            version: "1.2.3".to_owned(),
            system: Some("Fedora 43".to_owned()),
            log: vec![
                "INFO omnileaf_app: open the library".to_owned(),
                "WARN omnileaf_engine::scan: skip a book path=<path>".to_owned(),
            ],
        }
    );
}

#[test]
fn writes_its_code_the_version_details_then_the_log_lines() {
    let report = report_of(CODE, &logged());

    let text = report.to_string();

    assert_eq!(
        text,
        "Report code: R-Y6FN\n\
         Omnileaf 1.2.3, release build\n\
         Platform: Linux on x86_64\n\
         System: Fedora 43\n\
         Webview: 2.50.1\n\
         Runtime: Tauri 2.12.0\n\
         \n\
         Log, names replaced:\n\
         INFO omnileaf_app: open the library\n\
         WARN omnileaf_engine::scan: skip a book path=<path>\n"
    );
}

#[test]
fn says_when_nothing_was_logged() {
    let report = report_of(CODE, &[]);

    let text = report.to_string();

    assert!(
        text.ends_with("\nLog, names replaced:\nNothing logged yet.\n"),
        "{text}"
    );
}

#[test]
fn names_a_report_by_four_letters_or_digits_easy_to_read_aloud() {
    let codes = [0, u32::MAX, CODE].map(|random| ReportCode::from_random(random).to_string());

    assert_eq!(codes, ["R-0000", "R-ZZZZ", "R-Y6FN"]);
}

proptest! {
    #[test]
    fn reads_back_every_code_it_hands_out(random in any::<u32>()) {
        let code = ReportCode::from_random(random);

        let read: ReportCode = serde_json::from_value(serde_json::json!(code.to_string())).unwrap();

        prop_assert_eq!(read, code);
    }
}

#[test]
fn refuses_text_that_is_not_a_report_code() {
    let texts = [
        "", "R-", "R-123", "R-12345", "X-1234", "r-1234", "R-12O4", "R-12 4",
    ];

    let read = texts.map(|text| serde_json::from_value::<ReportCode>(serde_json::json!(text)).ok());

    assert_eq!(read, texts.map(|_| None));
}

#[test]
fn carries_nothing_that_tells_one_device_from_another_but_its_code() {
    let first = report_of(1, &logged()).to_string();
    let second = report_of(2, &logged()).to_string();

    let unlike: Vec<(&str, &str)> = first
        .lines()
        .zip(second.lines())
        .filter(|(one, other)| one != other)
        .collect();

    assert_eq!(unlike, [("Report code: R-1000", "Report code: R-2000")]);
}

#[test]
fn opens_the_bug_report_form_with_the_platform_version_and_report_filled_in() {
    let report = report_of(CODE, &logged());

    let url = report.new_issue_url();

    let fields = fields(&url);
    assert!(url.starts_with(ProjectLink::NewIssue.url()), "{url}");
    assert_eq!(fields["platform"], "Linux");
    assert_eq!(fields["version"], "1.2.3");
    assert_eq!(fields["logs"], report.to_string());
}

#[test]
fn keeps_the_newest_lines_that_fit_and_says_how_many_older_ones_were_left_out() {
    let lines: Vec<String> = (1..=200)
        .map(|number| {
            format!(
                "INFO omnileaf_engine::scan: line {number:03} {}",
                "x".repeat(100)
            )
        })
        .collect();
    let report = report_of(CODE, &lines);

    let url = report.new_issue_url();

    let logs = &fields(&url)["logs"];
    assert!(url.len() <= BROWSER_URL_LIMIT, "{}", url.len());
    assert!(logs.contains("line 200"), "{logs}");
    assert!(!logs.contains("line 001"), "{logs}");
    assert!(
        logs.contains("older lines left out; Copy report has them all"),
        "{logs}"
    );
}

proptest! {
    #[test]
    fn every_code_uses_the_easily_read_letters_and_digits(random in any::<u32>()) {
        let code = ReportCode::from_random(random).to_string();

        prop_assert!(code.starts_with("R-"));
        prop_assert_eq!(code.len(), 6);
        prop_assert!(
            code.chars().skip(2).all(|symbol| "0123456789ABCDEFGHJKMNPQRSTVWXYZ".contains(symbol)),
            "{}",
            code
        );
    }

    #[test]
    fn stays_short_enough_for_a_browser(
        lines in prop::collection::vec("[^\n]{0,300}", 0..200),
    ) {
        let report = report_of(CODE, &lines);

        let url = report.new_issue_url();

        prop_assert!(url.len() <= BROWSER_URL_LIMIT, "{}", url.len());
    }
}
