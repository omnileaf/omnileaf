#![expect(
    clippy::unwrap_used,
    reason = "the test folders are fixtures, so a failed set-up should stop the test"
)]

use std::{
    env, fs,
    path::{Path, PathBuf},
    process, thread,
};

use omnileaf_engine::{
    CrashReport, CrashReportError, CrashReportFile, CrashReportId, CrashReportOffers, CrashedApp,
    InterfaceError, PanicDetails, Platform, SourceLocation,
};

const BROWSER_URL_LIMIT: usize = 8000;

struct TempFolder(PathBuf);

impl TempFolder {
    fn new(name: &str) -> Self {
        let path = env::temp_dir()
            .join(format!("omnileaf-crash-reports-{}", process::id()))
            .join(name);
        let _ = fs::remove_dir_all(&path);
        Self(path)
    }

    fn path(&self) -> &Path {
        &self.0
    }

    fn file(&self) -> CrashReportFile {
        CrashReportFile::in_folder(self.path())
    }

    fn offers(&self) -> CrashReportOffers {
        CrashReportOffers::new(self.file())
    }

    fn saved_text(&self) -> String {
        let file = fs::read_dir(self.path()).unwrap().next().unwrap().unwrap();
        fs::read_to_string(file.path()).unwrap()
    }

    fn replace_saved_text(&self, text: &str) {
        let file = fs::read_dir(self.path()).unwrap().next().unwrap().unwrap();
        fs::write(file.path(), text).unwrap();
    }
}

impl Drop for TempFolder {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
        let _ = fs::remove_file(&self.0);
    }
}

fn report(millis: u64, message: &str) -> CrashReport {
    CrashReport::from_interface_error(
        CrashReportId::from_millis(millis),
        CrashedApp {
            version: "1.2.3".to_owned(),
            platform: Platform::Android,
            system: None,
        },
        &InterfaceError {
            message: message.to_owned(),
            stack: Some("at turn\nat open".to_owned()),
        },
    )
}

#[test]
fn offers_nothing_when_no_crash_was_saved() {
    let folder = TempFolder::new("nothing-saved");

    let offered = folder.offers().offer_saved().unwrap();

    assert_eq!(offered, None);
}

#[test]
fn offers_the_report_saved_by_an_earlier_run() {
    let folder = TempFolder::new("earlier-run");
    folder.file().save(&report(1, "first")).unwrap();

    let offered = folder.offers().offer_saved().unwrap();

    assert_eq!(offered, Some(report(1, "first")));
}

#[test]
fn offers_a_new_report_and_keeps_it_for_the_next_run() {
    let folder = TempFolder::new("kept-for-next-run");
    let offered = folder.offers().offer(report(1, "first")).unwrap();

    let next_run = folder.offers().offer_saved().unwrap();

    assert_eq!(offered, report(1, "first"));
    assert_eq!(next_run, Some(report(1, "first")));
}

#[test]
fn keeps_the_report_on_offer_when_another_arrives() {
    let folder = TempFolder::new("another-arrives");
    let offers = folder.offers();
    offers.offer(report(1, "first")).unwrap();

    let offered = offers.offer(report(2, "second")).unwrap();

    assert_eq!(offered, report(1, "first"));
    assert_eq!(offers.offered(), Some(report(1, "first")));
}

#[test]
fn keeps_offering_the_same_report_until_it_is_settled() {
    let folder = TempFolder::new("same-until-settled");
    let offers = folder.offers();
    offers.offer(report(1, "first")).unwrap();
    folder.file().save(&report(2, "second")).unwrap();

    let offered = offers.offer_saved().unwrap();

    assert_eq!(offered, Some(report(1, "first")));
}

#[test]
fn forgets_a_settled_report() {
    let folder = TempFolder::new("settled");
    let offers = folder.offers();
    offers.offer(report(1, "first")).unwrap();

    offers.settle().unwrap();

    assert_eq!(offers.offered(), None);
    assert_eq!(folder.offers().offer_saved().unwrap(), None);
}

#[test]
fn leaves_a_newer_saved_report_for_the_next_run() {
    let folder = TempFolder::new("newer-saved");
    let offers = folder.offers();
    offers.offer(report(1, "first")).unwrap();
    folder.file().save(&report(2, "second")).unwrap();

    offers.settle().unwrap();

    assert_eq!(
        folder.offers().offer_saved().unwrap(),
        Some(report(2, "second"))
    );
}

#[test]
fn discards_a_saved_report_it_cannot_read() {
    let folder = TempFolder::new("unreadable");
    folder.file().save(&report(1, "first")).unwrap();
    folder.replace_saved_text("not a report");

    let first_try = folder.offers().offer_saved();
    let second_try = folder.offers().offer_saved().unwrap();

    assert!(matches!(first_try, Err(CrashReportError::Parse(_))));
    assert_eq!(second_try, None);
}

#[test]
fn discards_a_saved_report_too_large_to_be_one() {
    let folder = TempFolder::new("too-large");
    folder.file().save(&report(1, "first")).unwrap();
    let edited = folder
        .saved_text()
        .replace("first", &"a".repeat(1024 * 1024));
    folder.replace_saved_text(&edited);

    let first_try = folder.offers().offer_saved();
    let second_try = folder.offers().offer_saved().unwrap();

    assert!(matches!(first_try, Err(CrashReportError::Parse(_))));
    assert_eq!(second_try, None);
}

#[test]
fn cleans_a_saved_report_again_when_reading_it() {
    let folder = TempFolder::new("cleaned-again");
    folder.file().save(&report(1, "first")).unwrap();
    let edited = folder
        .saved_text()
        .replace("first", "open /home/sample-user/Comics");
    folder.replace_saved_text(&edited);

    let offered = folder.offers().offer_saved().unwrap().unwrap();

    assert!(!offered.to_string().contains("sample-user"), "{offered}");
}

#[test]
fn cleans_and_bounds_the_version_and_system_of_a_saved_report() {
    let folder = TempFolder::new("cleaned-app");
    folder.file().save(&report(1, "first")).unwrap();
    let edited = folder
        .saved_text()
        .replace(
            "\"version\":\"1.2.3\"",
            "\"version\":\"1.2.3 /home/sample-user/Comics\"",
        )
        .replace(
            "\"system\":null",
            &format!("\"system\":\"{}\"", "Sample OS ".repeat(1000)),
        );
    folder.replace_saved_text(&edited);

    let offered = folder.offers().offer_saved().unwrap().unwrap();

    assert!(!offered.to_string().contains("sample-user"), "{offered}");
    assert!(
        offered.new_issue_url().len() <= BROWSER_URL_LIMIT,
        "{offered}"
    );
}

fn panic_report() -> CrashReport {
    CrashReport::from_panic(
        CrashReportId::from_millis(1),
        CrashedApp {
            version: "1.2.3".to_owned(),
            platform: Platform::Linux,
            system: None,
        },
        &PanicDetails {
            message: "boom",
            location: Some(SourceLocation {
                file: "crates/omnileaf-formats/src/zip_book.rs",
                line: 42,
                column: 5,
            }),
            backtrace: "",
        },
    )
}

#[test]
fn keeps_where_a_saved_panic_happened() {
    let folder = TempFolder::new("panic-location");
    folder.file().save(&panic_report()).unwrap();

    let offered = folder.offers().offer_saved().unwrap().unwrap();

    assert!(
        offered
            .to_string()
            .contains("\nAt: omnileaf-formats/src/zip_book.rs:42:5\n"),
        "{offered}"
    );
}

#[test]
fn bounds_where_a_saved_panic_happened() {
    let folder = TempFolder::new("panic-location-bounded");
    folder.file().save(&panic_report()).unwrap();
    let edited = folder
        .saved_text()
        .replace("zip_book.rs", &"x".repeat(10_000));
    folder.replace_saved_text(&edited);

    let offered = folder.offers().offer_saved().unwrap().unwrap();

    assert!(
        offered.new_issue_url().len() <= BROWSER_URL_LIMIT,
        "{offered}"
    );
}

#[test]
fn saves_from_several_threads_at_once_without_losing_the_report() {
    let folder = TempFolder::new("concurrent-saves");
    let file = folder.file();

    let outcomes: Vec<bool> = thread::scope(|scope| {
        let savers: Vec<_> = (0..8_u64)
            .map(|saver| {
                let file = file.clone();
                scope.spawn(move || {
                    (0..50_u64).all(|n| file.save(&report(saver * 100 + n, "busy")).is_ok())
                })
            })
            .collect();
        savers
            .into_iter()
            .map(|saver| saver.join().unwrap())
            .collect()
    });

    assert!(outcomes.iter().all(|saved| *saved), "{outcomes:?}");
    assert!(file.load().unwrap().is_some());
}

#[test]
fn offers_a_report_for_this_run_when_there_is_nowhere_to_keep_it() {
    let offers = CrashReportOffers::in_memory();

    let offered = offers.offer(report(1, "first")).unwrap();
    let still_offered = offers.offer_saved().unwrap();
    offers.settle().unwrap();

    assert_eq!(offered, report(1, "first"));
    assert_eq!(still_offered, Some(report(1, "first")));
    assert_eq!(offers.offered(), None);
}

#[test]
fn still_offers_a_report_it_could_not_save() {
    let folder = TempFolder::new("unsaved");
    fs::create_dir_all(folder.path().parent().unwrap()).unwrap();
    fs::write(folder.path(), "a file where the folder should be").unwrap();
    let offers = folder.offers();

    let unsaved = offers.offer(report(1, "first")).unwrap_err();

    assert_eq!(*unsaved.report, report(1, "first"));
    assert!(matches!(unsaved.source, CrashReportError::Save(_)));
    assert_eq!(offers.offered(), Some(report(1, "first")));
}
