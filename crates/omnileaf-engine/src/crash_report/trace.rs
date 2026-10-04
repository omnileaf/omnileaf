use super::scrub::SEPARATORS;

const SOURCE_FOLDER: &str = "src";
const SHORT_BACKTRACE_END: &str = "__rust_end_short_backtrace";
const SHORT_BACKTRACE_BEGIN: &str = "__rust_begin_short_backtrace";
const PANIC_MACHINERY: &[&str] = &[
    "rust_begin_unwind",
    "__rustc::rust_begin_unwind",
    "core::panicking::",
    "std::panicking::",
];

/// Names a source file from its package down, so no folder of the machine that built it shows.
pub(super) fn package_relative(file: &str) -> String {
    let components: Vec<&str> = file
        .split(SEPARATORS)
        .filter(|component| !component.is_empty())
        .collect();
    let from = components
        .iter()
        .rposition(|component| *component == SOURCE_FOLDER)
        .and_then(|source| source.checked_sub(1))
        .unwrap_or(components.len().saturating_sub(1));
    components.get(from..).unwrap_or_default().join("/")
}

/// The function names of a standard library backtrace, from the code that panicked to the thread's start.
pub(super) fn frame_names(backtrace: &str) -> Vec<&str> {
    let names: Vec<&str> = backtrace.lines().filter_map(frame_name).collect();
    let start = names
        .iter()
        .position(|name| name.contains(SHORT_BACKTRACE_END))
        .map_or(0, |end_marker| end_marker.saturating_add(1));
    let end = names
        .iter()
        .rposition(|name| name.contains(SHORT_BACKTRACE_BEGIN))
        .filter(|begin_marker| *begin_marker >= start)
        .unwrap_or(names.len());
    names
        .get(start..end)
        .unwrap_or_default()
        .iter()
        .copied()
        .skip_while(|name| is_panic_machinery(name))
        .collect()
}

fn frame_name(line: &str) -> Option<&str> {
    let (index, name) = line.trim_start().split_once(": ")?;
    let is_frame_number = !index.is_empty() && index.chars().all(|digit| digit.is_ascii_digit());
    is_frame_number.then_some(name.trim())
}

fn is_panic_machinery(name: &str) -> bool {
    PANIC_MACHINERY
        .iter()
        .any(|prefix| name.starts_with(prefix))
}
