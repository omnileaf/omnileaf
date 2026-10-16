#![expect(
    clippy::unwrap_used,
    reason = "each test opens its own library in a scratch folder, so a failed set-up should stop the test"
)]

#[expect(
    dead_code,
    reason = "these tests need scratch folders but none of the files support can put in them"
)]
mod support;

use omnileaf_engine::{Library, LogStandIns, SeriesId};
use omnileaf_testkit::{SAMPLE_LIBRARY_NAME, write_sample_library};
use proptest::prelude::*;
use support::{FixedClock, ScratchFolder};

const SERIES_ID: &str = "0190a3e4-0000-8000-8000-000000000042";
const SERIES_STAND_IN: &str = "Series 68";
const FOLDER_STAND_IN: &str = "Folder 731";

fn series(title: &str) -> (SeriesId, String) {
    (
        SeriesId::try_from(SERIES_ID.to_owned()).unwrap(),
        title.to_owned(),
    )
}

fn no_folders() -> Vec<String> {
    Vec::new()
}

#[test]
fn names_a_series_by_the_stand_in_screenshot_mode_gives_it() {
    let stand_ins = LogStandIns::new([series("Harbour Gate")], no_folders());

    let cleaned = stand_ins.clean("INFO scan: found Harbour Gate in a folder");

    assert_eq!(
        cleaned,
        format!("INFO scan: found {SERIES_STAND_IN} in a folder")
    );
}

#[test]
fn names_a_folder_by_the_stand_in_screenshot_mode_gives_it() {
    let stand_ins = LogStandIns::new([], ["Comics".to_owned()]);

    let cleaned = stand_ins.clean("WARN watch: Comics went missing");

    assert_eq!(
        cleaned,
        format!("WARN watch: {FOLDER_STAND_IN} went missing")
    );
}

#[test]
fn replaces_the_longest_name_that_fits() {
    let stand_ins = LogStandIns::new([series("Saga Deluxe")], ["Saga".to_owned()]);

    let cleaned = stand_ins.clean("INFO scan: Saga Deluxe holds Saga");

    assert_eq!(
        cleaned,
        format!("INFO scan: {SERIES_STAND_IN} holds Folder 955")
    );
}

#[test]
fn leaves_a_name_inside_a_longer_word_alone() {
    let stand_ins = LogStandIns::new([series("Saga")], no_folders());

    let cleaned = stand_ins.clean("INFO scan: Sagas and Megasaga");

    assert_eq!(cleaned, "INFO scan: Sagas and Megasaga");
}

#[test]
fn takes_paths_and_quoted_text_out_as_a_crash_report_does() {
    let stand_ins = LogStandIns::default();

    let cleaned =
        stand_ins.clean(r#"WARN scan: skip a book name="Old" path=/home/kai/Comics/Old.cbz"#);

    assert_eq!(cleaned, r#"WARN scan: skip a book name="…" path=<path>"#);
}

#[tokio::test]
async fn names_the_library_s_series_and_folders_by_their_stand_ins() {
    let comics = ScratchFolder::new("log-stand-ins-comics");
    write_sample_library(comics.path()).unwrap();
    let home = ScratchFolder::new("log-stand-ins-home");
    let library = Library::open(home.path().to_path_buf(), FixedClock)
        .await
        .unwrap();
    library
        .add_folder(comics.path().join(SAMPLE_LIBRARY_NAME), |_| {})
        .await
        .unwrap();

    let stand_ins = library.log_stand_ins().await.unwrap();

    let cleaned = stand_ins.clean(&format!(
        "INFO scan: Sample Series 02 is in {SAMPLE_LIBRARY_NAME}"
    ));
    assert!(!cleaned.contains("Sample Series 02"), "{cleaned}");
    assert!(!cleaned.contains(SAMPLE_LIBRARY_NAME), "{cleaned}");
    assert!(cleaned.starts_with("INFO scan: Series "), "{cleaned}");
}

fn name() -> impl Strategy<Value = String> {
    "Qx[a-z]{2,8}( [A-Z][a-z]{1,8}){0,3}"
}

fn line_around(name: &str, shape: usize) -> String {
    match shape % 4 {
        0 => format!("INFO scan: found {name} in a folder"),
        1 => format!("WARN scan: skip path=/home/{name}/{name}.cbz"),
        2 => format!(r#"ERROR open: title="{name}" error=gone"#),
        _ => format!("INFO rescan: {name}, then {name}."),
    }
}

proptest! {
    #[test]
    fn no_series_or_folder_name_survives(
        title in name(),
        folder in name(),
        shapes in (0usize..4, 0usize..4),
    ) {
        let stand_ins = LogStandIns::new([series(&title)], [folder.clone()]);
        let line = format!("{} {}", line_around(&title, shapes.0), line_around(&folder, shapes.1));

        let cleaned = stand_ins.clean(&line);

        prop_assert!(!cleaned.contains(&title), "{cleaned}");
        prop_assert!(!cleaned.contains(&folder), "{cleaned}");
    }
}
