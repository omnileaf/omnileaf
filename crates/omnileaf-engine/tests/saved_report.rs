#![expect(
    clippy::unwrap_used,
    reason = "each test saves into its own scratch folder, so a failed set-up should stop the test"
)]

use std::{fs, path::Path};

use omnileaf_engine::{
    AppInfo, BuildProfile, LocalDay, LogStandIns, Platform, ProblemReport, ReportCode,
    VersionDetails, folder_shown,
};
use omnileaf_testkit::ScratchFolder;

const OCTOBER_16_2026: LocalDay = LocalDay(20_742);

fn report() -> ProblemReport {
    ProblemReport::new(
        ReportCode::from_random(7),
        VersionDetails {
            app: AppInfo {
                version: "1.2.3".to_owned(),
                platform: Platform::Linux,
                source_code: "repo.example.org/omnileaf".to_owned(),
                is_development_build: false,
            },
            build: BuildProfile::Release,
            architecture: "x86_64".to_owned(),
            system: None,
            webview: None,
            runtime: "Tauri 2.12.0".to_owned(),
        },
        LogStandIns::default().clean_log(&["INFO omnileaf_app: open the library".to_owned()]),
    )
}

fn file_name(path: &Path) -> &str {
    path.file_name().unwrap().to_str().unwrap()
}

#[test]
fn saves_the_report_s_text_in_a_file_named_for_the_day() {
    let folder = ScratchFolder::new("saved-report-day");
    let report = report();

    let saved = report.save_in(folder.path(), OCTOBER_16_2026).unwrap();

    assert_eq!(file_name(&saved), "omnileaf-report-2026-10-16.txt");
    assert_eq!(fs::read_to_string(&saved).unwrap(), report.to_string());
}

#[test]
fn names_days_across_leap_years_and_before_1970() {
    let folder = ScratchFolder::new("saved-report-calendar");

    let names: Vec<String> = [LocalDay(11_016), LocalDay(0), LocalDay(-1)]
        .into_iter()
        .map(|day| file_name(&report().save_in(folder.path(), day).unwrap()).to_owned())
        .collect();

    assert_eq!(
        names,
        [
            "omnileaf-report-2000-02-29.txt",
            "omnileaf-report-1970-01-01.txt",
            "omnileaf-report-1969-12-31.txt",
        ]
    );
}

#[test]
fn never_writes_over_a_file_already_there() {
    let folder = ScratchFolder::new("saved-report-again");
    let earlier = folder.path().join("omnileaf-report-2026-10-16.txt");
    fs::write(&earlier, "kept").unwrap();

    let first = report().save_in(folder.path(), OCTOBER_16_2026).unwrap();
    let second = report().save_in(folder.path(), OCTOBER_16_2026).unwrap();

    assert_eq!(fs::read_to_string(&earlier).unwrap(), "kept");
    assert_eq!(
        [file_name(&first), file_name(&second)],
        [
            "omnileaf-report-2026-10-16-2.txt",
            "omnileaf-report-2026-10-16-3.txt"
        ]
    );
}

#[test]
fn says_when_the_folder_can_t_take_the_file() {
    let folder = ScratchFolder::new("saved-report-missing");

    let saved = report().save_in(&folder.path().join("gone"), OCTOBER_16_2026);

    assert!(saved.is_err());
}

#[test]
fn shows_a_linux_folder_from_home_as_a_tilde() {
    let shown = folder_shown(
        Path::new("/home/kai/Downloads"),
        Some(Path::new("/home/kai")),
        Platform::Linux,
    );

    assert_eq!(shown, "~/Downloads");
}

#[test]
fn shows_a_linux_folder_outside_home_in_full() {
    let shown = folder_shown(
        Path::new("/data/downloads"),
        Some(Path::new("/home/kai")),
        Platform::Linux,
    );

    assert_eq!(shown, "/data/downloads");
}

#[test]
fn shows_a_mac_or_windows_folder_by_its_name() {
    let shown = [Platform::Macos, Platform::Windows].map(|platform| {
        folder_shown(
            Path::new("/Users/kai/Downloads"),
            Some(Path::new("/Users/kai")),
            platform,
        )
    });

    assert_eq!(shown, ["Downloads", "Downloads"]);
}
