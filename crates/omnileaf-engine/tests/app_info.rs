use omnileaf_engine::Core;

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
