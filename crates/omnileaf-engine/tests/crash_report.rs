use omnileaf_engine::{
    CrashReport, CrashReportId, CrashedApp, PanicDetails, Platform, SourceLocation,
};

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
    let report = CrashReport::from_panic(
        id(),
        CrashedApp {
            system: None,
            ..app()
        },
        &PanicDetails {
            message: "boom",
            location: None,
            backtrace: "",
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
