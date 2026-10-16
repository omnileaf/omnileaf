use omnileaf_engine::{
    AppInfo, BuildProfile, LogStandIns, Platform, ProblemReport, ProblemReportPreview,
    VersionDetails,
};

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

#[test]
fn shows_the_version_the_system_and_the_cleaned_log() {
    let report = ProblemReport::new(details(), &logged(), &LogStandIns::default());

    let preview = report.preview();

    assert_eq!(
        preview,
        ProblemReportPreview {
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
fn writes_the_version_details_then_the_log_lines() {
    let report = ProblemReport::new(details(), &logged(), &LogStandIns::default());

    let text = report.to_string();

    assert_eq!(
        text,
        "Omnileaf 1.2.3, release build\n\
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
    let report = ProblemReport::new(details(), &[], &LogStandIns::default());

    let text = report.to_string();

    assert!(
        text.ends_with("\nLog, names replaced:\nNothing logged yet.\n"),
        "{text}"
    );
}
