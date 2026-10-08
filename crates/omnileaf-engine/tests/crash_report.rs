use omnileaf_engine::{
    CrashReport, CrashReportId, CrashedApp, InterfaceError, PanicDetails, Platform, SourceLocation,
};
use proptest::prelude::*;

const BACKTRACE: &str = "   0: omnileaf_app::crash_reporting::hook
   1: std::panicking::panic_with_hook
             at /rustc/0123abcd/library/std/src/panicking.rs:823:13
   2: std::sys::backtrace::__rust_end_short_backtrace::<std::panicking::panic_handler::{closure#0}, !>
             at /rustc/0123abcd/library/std/src/sys/backtrace.rs:182:18
   3: __rustc::rust_begin_unwind
             at /rustc/0123abcd/library/std/src/panicking.rs:679:5
   4: core::panicking::panic_fmt
             at /rustc/0123abcd/library/core/src/panicking.rs:80:14
   5: core::panicking::panic_bounds_check
             at /rustc/0123abcd/library/core/src/panicking.rs:271:5
   6: omnileaf_formats::zip_book::read_page
             at /home/sample-user/projects/omnileaf/crates/omnileaf-formats/src/zip_book.rs:42:5
   7: omnileaf_engine::pages::open
   8: std::sys::backtrace::__rust_begin_short_backtrace::<fn(), ()>
   9: std::rt::lang_start::<()>::{closure#0}
  10: main
";

const MESSAGE_BYTE_LIMIT: usize = 240;
const FRAME_LIMIT: usize = 12;

fn app() -> CrashedApp {
    CrashedApp {
        version: "1.2.3".to_owned(),
        platform: Platform::Linux,
        system: Some("Sample OS 4.5".to_owned()),
    }
}

fn id() -> CrashReportId {
    CrashReportId::from_millis(1_700_000_000_000)
}

fn panic_report(message: &str) -> String {
    CrashReport::from_panic(
        id(),
        app(),
        &PanicDetails {
            message,
            location: Some(SourceLocation {
                file: "crates/omnileaf-formats/src/zip_book.rs",
                line: 42,
                column: 5,
            }),
            backtrace: BACKTRACE,
        },
    )
    .to_string()
}

fn interface_report(message: &str, stack: Option<&str>) -> String {
    CrashReport::from_interface_error(
        id(),
        app(),
        &InterfaceError {
            message: message.to_owned(),
            stack: stack.map(str::to_owned),
        },
    )
    .to_string()
}

fn located_at(file: &str) -> String {
    CrashReport::from_panic(
        id(),
        app(),
        &PanicDetails {
            message: "boom",
            location: Some(SourceLocation {
                file,
                line: 7,
                column: 9,
            }),
            backtrace: "",
        },
    )
    .to_string()
}

fn message_line(report: &str) -> &str {
    report
        .lines()
        .find_map(|line| line.strip_prefix("Interface error: "))
        .unwrap_or_default()
}

#[test]
fn gives_the_version_platform_system_message_location_and_backtrace() {
    let report = panic_report("index out of bounds: the len is 2 but the index is 5");

    assert_eq!(
        report,
        "Omnileaf 1.2.3 on Linux (Sample OS 4.5)\n\
         Panic: index out of bounds: the len is 2 but the index is 5\n\
         At: omnileaf-formats/src/zip_book.rs:42:5\n\
         Backtrace:\n\
         \x20 omnileaf_formats::zip_book::read_page\n\
         \x20 omnileaf_engine::pages::open\n"
    );
}

#[test]
fn names_the_platform_alone_when_the_system_is_unknown() {
    let report = CrashReport::from_interface_error(
        id(),
        CrashedApp {
            system: None,
            ..app()
        },
        &InterfaceError {
            message: "boom".to_owned(),
            stack: None,
        },
    )
    .to_string();

    assert!(report.starts_with("Omnileaf 1.2.3 on Linux\n"), "{report}");
}

#[test]
fn trims_a_dependency_location_to_its_package() {
    let report = located_at(
        "/home/sample-user/.cargo/registry/src/index.crates.io-0123/zip-8.6.0/src/read.rs",
    );

    assert!(
        report.contains("\nAt: zip-8.6.0/src/read.rs:7:9\n"),
        "{report}"
    );
}

#[test]
fn trims_a_location_outside_any_package_to_its_file_name() {
    let report = located_at("C:\\Users\\Sample User\\build\\main.rs");

    assert!(report.contains("\nAt: main.rs:7:9\n"), "{report}");
}

#[test]
fn leaves_out_the_location_when_the_panic_had_none() {
    let report = CrashReport::from_panic(
        id(),
        app(),
        &PanicDetails {
            message: "boom",
            location: None,
            backtrace: "",
        },
    )
    .to_string();

    assert!(!report.contains("At:"), "{report}");
}

#[test]
fn keeps_every_frame_when_the_backtrace_has_no_markers() {
    let report = CrashReport::from_panic(
        id(),
        app(),
        &PanicDetails {
            message: "boom",
            location: None,
            backtrace: "   0: first::frame\n             at /home/sample-user/a.rs:1:1\n   1: second::frame\n",
        },
    )
    .to_string();

    assert!(
        report.ends_with("Backtrace:\n  first::frame\n  second::frame\n"),
        "{report}"
    );
}

#[test]
fn replaces_quoted_text_in_a_panic_message() {
    let report = panic_report(
        r#"called `Result::unwrap()` on an `Err` value: Custom { kind: NotFound, error: "\"/home/sample-user/Sample Series 01.cbz\"" }"#,
    );

    assert!(
        report.contains(
            "Panic: called `Result::unwrap()` on an `Err` value: Custom { kind: NotFound, error: \"…\" }\n"
        ),
        "{report}"
    );
}

#[test]
fn replaces_a_path_and_the_rest_of_its_line() {
    let report =
        panic_report("open archive /home/sample-user/My Comics/Sample Series 01.cbz: truncated");

    assert!(report.contains("Panic: open archive <path>\n"), "{report}");
}

#[test]
fn recognises_windows_home_relative_and_content_paths() {
    let messages = [
        "read C:\\Users\\Sample User\\Comics",
        "read D:/Comics/Sample Series",
        "read \\\\nas\\Comics",
        "read ~/Comics/Sample Series",
        "read ../Comics/Sample Series",
        "read content://documents.example/tree/primary%3AComics",
        "read (file:///Users/sample/Comics)",
    ];

    let lines: Vec<String> = messages
        .iter()
        .map(|message| message_line(&interface_report(message, None)).to_owned())
        .collect();

    assert!(
        lines
            .iter()
            .all(|line| line == "read <path>" || line == "read (<path>"),
        "{lines:?}"
    );
}

#[test]
fn recognises_a_path_however_it_is_quoted_or_introduced() {
    let messages = [
        "failed to read `/home/sample-user/Comics/Sample Series 01.cbz`: bad",
        "path:/home/sample-user/Comics/x.cbz",
        "open <C:\\Users\\sample-user\\Comics\\x.cbz>",
        "entry 'Sample Series/page1.jpg' broken",
        "couldn't decode Comics/Sample Series/ch01.cbz",
        "no such file “/home/sample-user/Sample”",
        "read Comics/Sample/Volume 1",
    ];

    let lines: Vec<String> = messages
        .iter()
        .map(|message| message_line(&interface_report(message, None)).to_owned())
        .collect();

    assert!(
        lines.iter().all(|line| !line.contains("sample-user")
            && !line.contains("Comics")
            && !line.contains("Sample")),
        "{lines:?}"
    );
}

#[test]
fn replaces_text_in_backticks_and_typographic_quotes() {
    let messages = [
        "no series `Sample Title` here",
        "no series “Sample Title” here",
        "no series ‘Sample Title’ here",
        "no series 'Sample Title' here",
    ];

    let lines: Vec<String> = messages
        .iter()
        .map(|message| message_line(&interface_report(message, None)).to_owned())
        .collect();

    assert!(
        lines.iter().all(|line| line == "no series \"…\" here"),
        "{lines:?}"
    );
}

#[test]
fn keeps_the_code_a_standard_panic_message_names_in_backticks() {
    let report = panic_report("called `Option::unwrap()` on a `None` value");

    assert!(
        report.contains("\nPanic: called `Option::unwrap()` on a `None` value\n"),
        "{report}"
    );
}

#[test]
fn takes_out_a_path_in_backticks_beside_code() {
    let report = interface_report("`Path::new()` failed on `Comics/Sample Series`", None);

    assert_eq!(message_line(&report), "`Path::new()` failed on \"…\"");
}

#[test]
fn keeps_an_apostrophe_inside_a_word() {
    let report = interface_report("couldn't open the app's page", None);

    assert_eq!(message_line(&report), "couldn't open the app's page");
}

#[test]
fn keeps_a_fraction() {
    let report = interface_report("expected 1/2 of the pages", None);

    assert_eq!(message_line(&report), "expected 1/2 of the pages");
}

#[test]
fn recognises_a_relative_path_or_a_file_name_with_the_words_before_it() {
    let messages = [
        "entry Sample Series 01/001.jpg is damaged",
        "decode My Comics/Sample Series/vol 1.cbz",
        "folder Comics/Sample Series is unreadable",
        "decoding Sample Title.cbz",
        "Manga\\Sample Series",
    ];

    let lines: Vec<String> = messages
        .iter()
        .map(|message| message_line(&interface_report(message, None)).to_owned())
        .collect();

    assert_eq!(lines, vec!["<path>"; messages.len()]);
}

#[test]
fn keeps_what_introduces_a_relative_path() {
    let report = interface_report("read primary:Comics/My Manga", None);

    assert_eq!(message_line(&report), "read primary:<path>");
}

#[test]
fn reports_an_interface_error_with_its_stack() {
    let report = interface_report(
        "TypeError: undefined is not an object",
        Some(
            "open@http://tauri.localhost/_app/chunks/reader.js:1:200\nTypeError: x\n    at turn (tauri://localhost/_app/chunks/reader.js:3:9)",
        ),
    );

    assert_eq!(
        report,
        "Omnileaf 1.2.3 on Linux (Sample OS 4.5)\n\
         Interface error: TypeError: undefined is not an object\n\
         Stack:\n\
         \x20 open@<path>\n\
         \x20 TypeError: x\n\
         \x20 at turn (<path>\n"
    );
}

#[test]
fn shortens_a_long_message() {
    let report = interface_report(&"a".repeat(1000), None);

    let shown = message_line(&report);

    assert_eq!(shown.len(), MESSAGE_BYTE_LIMIT, "{shown}");
    assert!(shown.ends_with('…'), "{shown}");
}

#[test]
fn keeps_at_most_a_screenful_of_frames() {
    let stack: Vec<String> = (0..100).map(|n| format!("frame{n}")).collect();

    let report = interface_report("boom", Some(&stack.join("\n")));

    let frames = report
        .lines()
        .filter(|line| line.starts_with("  frame"))
        .count();
    assert_eq!(frames, FRAME_LIMIT);
}

proptest! {
    #[test]
    fn never_names_a_folder_in_an_absolute_path(
        before in "[a-z ]{0,20}",
        folder in "[A-Z]{3}[A-Z ]{0,12}",
        file in "[A-Z]{3,10}",
    ) {
        let report = interface_report(&format!("{before} /home/{folder}/{file}.cbz"), Some(&format!("at /data/{folder}/{file}.cbz")));

        prop_assert!(!report.contains(folder.trim()), "{}", report);
        prop_assert!(!report.contains(&file), "{}", report);
    }

    #[test]
    fn never_names_a_folder_however_its_path_is_introduced(
        before in "[a-z ]{0,20}",
        opener in prop::sample::select(vec![" ", "`", ":", "<", "(", "“", "'", "=", "@"]),
        folder in "[A-Z]{3}[A-Z ]{0,12}",
        file in "[A-Z]{3,10}",
    ) {
        let report = interface_report(&format!("{before}{opener}/home/{folder}/{file}.cbz"), None);

        prop_assert!(!report.contains(folder.trim()), "{}", report);
        prop_assert!(!report.contains(&file), "{}", report);
    }

    #[test]
    fn never_names_a_folder_in_a_relative_path(
        before in "[a-z ]{0,20}",
        prefix in prop::sample::select(vec![" ", " primary:", " (", ": "]),
        root in "[A-Z]{3}([A-Z ]{0,10}[A-Z])?",
        separator in prop::sample::select(vec!["/", "\\"]),
        folder in "[A-Z]{3}([A-Z ]{0,10}[A-Z])?",
        file in "[A-Z]{3,10}",
        extension in prop::sample::select(vec![".cbz", ".jpg", ".epub"]),
    ) {
        let report = interface_report(&format!("{before}{prefix}{root}{separator}{folder}/{file}{extension}"), None);

        prop_assert!(!report.contains(root.trim()), "{}", report);
        prop_assert!(!report.contains(folder.trim()), "{}", report);
        prop_assert!(!report.contains(&file), "{}", report);
    }

    #[test]
    fn never_names_a_folder_in_a_relative_path_with_one_separator(
        before in "[a-z ]{0,20}",
        prefix in prop::sample::select(vec![" ", " primary:", " (", ": "]),
        root in "[A-Z]{3}([A-Z ]{0,10}[A-Z])?",
        separator in prop::sample::select(vec!["/", "\\"]),
        folder in "[A-Z]{3}[A-Z ]{0,12}",
        after in "[a-z ]{0,20}",
    ) {
        let report = interface_report(&format!("{before}{prefix}{root}{separator}{folder}{after}"), None);

        prop_assert!(!report.contains(root.trim()), "{}", report);
        prop_assert!(!report.contains(folder.trim()), "{}", report);
    }

    #[test]
    fn never_names_a_title_in_a_bare_file_name(
        before in "[a-z ]{0,20}",
        title in "[A-Z]{3}([A-Z ]{0,10}[A-Z])?",
        extension in prop::sample::select(vec![".cbz", ".CBR", ".jpg", ".epub", ".pdf"]),
        after in prop::sample::select(vec!["", ": damaged", ") failed"]),
    ) {
        let report = interface_report(&format!("{before} {title}{extension}{after}"), None);

        prop_assert!(!report.contains(title.trim()), "{}", report);
    }

    #[test]
    fn never_repeats_text_in_any_kind_of_quotes(
        before in "[a-z ]{0,20}",
        quotes in prop::sample::select(vec![("\"", "\""), ("`", "`"), ("“", "”"), ("‘", "’"), ("'", "'")]),
        title in "[A-Z]{3}[A-Z ]{0,12}",
    ) {
        let (open, close) = quotes;
        let report = interface_report(&format!("{before} {open}{title}{close} after"), None);

        prop_assert!(!report.contains(title.trim()), "{}", report);
    }

    #[test]
    fn leaves_cleaned_text_with_quotes_and_separators_as_it_is(
        message in "[a-zA-Z0-9 .:/\\\\'`\"“”‘’<>(@=\n]{0,120}",
    ) {
        let once = message_line(&interface_report(&message, None)).to_owned();

        let twice = message_line(&interface_report(&once, None)).to_owned();

        prop_assert_eq!(once, twice);
    }

    #[test]
    fn never_repeats_quoted_text(
        before in "[a-z ]{0,20}",
        title in "[A-Z]{3}[A-Z ]{0,12}",
    ) {
        let report = interface_report(&format!("{before} \"{title}\" after"), None);

        prop_assert!(!report.contains(title.trim()), "{}", report);
    }

    #[test]
    fn leaves_already_cleaned_text_as_it_is(message in "\\PC{0,200}") {
        let once = message_line(&interface_report(&message, None)).to_owned();

        let twice = message_line(&interface_report(&once, None)).to_owned();

        prop_assert_eq!(once, twice);
    }
}
