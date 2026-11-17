use omnileaf_engine::{Core, WindowBackdrop};

#[test]
fn reports_the_version_it_was_built_as() {
    let core = Core::new();

    let info = core.app_info();

    assert_eq!(info.version, env!("CARGO_PKG_VERSION"));
}

#[test]
fn reports_the_platform_it_was_built_for() {
    let core = Core::new();

    let platform = format!("{:?}", core.app_info().platform).to_lowercase();

    assert_eq!(platform, std::env::consts::OS);
}

#[test]
fn reports_where_its_source_code_lives_without_the_scheme() {
    let core = Core::new();

    let source_code = &core.app_info().source_code;

    assert_eq!(source_code, "github.com/omnileaf/omnileaf");
}

#[test]
fn says_whether_it_is_a_development_build() {
    let core = Core::new();

    let is_development_build = core.app_info().is_development_build;

    assert_eq!(is_development_build, cfg!(debug_assertions));
}

#[test]
fn reports_a_solid_window_until_told_of_a_backdrop() {
    let core = Core::new();

    let window_backdrop = core.app_info().window_backdrop;

    assert_eq!(window_backdrop, WindowBackdrop::None);
}

#[test]
fn reports_the_window_backdrop_the_app_draws() {
    let core = Core::new().with_window_backdrop(WindowBackdrop::Mica);

    let window_backdrop = core.app_info().window_backdrop;

    assert_eq!(window_backdrop, WindowBackdrop::Mica);
}

#[test]
fn does_not_check_for_updates_until_its_build_says_so() {
    let core = Core::new();

    let checks_for_updates = core.app_info().checks_for_updates;

    assert!(!checks_for_updates);
}

#[test]
fn checks_for_updates_when_its_build_says_so() {
    let core = Core::new().with_update_check();

    let checks_for_updates = core.app_info().checks_for_updates;

    assert!(checks_for_updates);
}

#[test]
fn keeps_the_window_backdrop_when_told_it_checks_for_updates() {
    let core = Core::new()
        .with_window_backdrop(WindowBackdrop::Mica)
        .with_update_check();

    let window_backdrop = core.app_info().window_backdrop;

    assert_eq!(window_backdrop, WindowBackdrop::Mica);
}
