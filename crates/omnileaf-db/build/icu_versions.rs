const ICU_PREFIX: &str = "icu_";
const SEPARATOR: &str = ",";

/// Lists every `icu_` package a `Cargo.lock` holds as `name version`, sorted, so any change to ICU4X's code or data changes the list.
pub(crate) fn icu_versions(lock: &str) -> String {
    let mut packages = Vec::new();
    let mut name = None;
    for line in lock.lines() {
        if let Some(value) = quoted_value(line, "name") {
            name = Some(value);
        } else if let Some(version) = quoted_value(line, "version")
            && let Some(package) = name.take().filter(|name| name.starts_with(ICU_PREFIX))
        {
            packages.push(format!("{package} {version}"));
        }
    }
    packages.sort_unstable();
    packages.join(SEPARATOR)
}

fn quoted_value<'l>(line: &'l str, key: &str) -> Option<&'l str> {
    line.strip_prefix(key)?
        .trim_start()
        .strip_prefix('=')?
        .trim()
        .strip_prefix('"')?
        .strip_suffix('"')
}
