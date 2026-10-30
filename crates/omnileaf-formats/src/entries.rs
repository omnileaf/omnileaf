use std::path::Path;

const MACOS_RESOURCE_FORK_FOLDER: &str = "__MACOSX";
const CURRENT_FOLDER: &str = ".";
const PARENT_FOLDER: &str = "..";
const SEPARATORS: [char; 2] = ['/', '\\'];
const WINDOWS_SHELL_FILES: [&str; 2] = ["thumbs.db", "desktop.ini"];
const PAGE_EXTENSIONS: [&str; 8] = ["jpg", "jpeg", "png", "webp", "gif", "avif", "jxl", "bmp"];
const FINGERPRINTED_EXTENSIONS: [&str; 12] = [
    "jpg", "jpeg", "png", "webp", "avif", "jxl", "gif", "bmp", "tif", "tiff", "heic", "heif",
];

#[must_use]
pub fn is_ignored(path: &str) -> bool {
    path.split(['/', '\\'])
        .filter(|component| *component != CURRENT_FOLDER)
        .any(|component| {
            component == MACOS_RESOURCE_FORK_FOLDER
                || component.starts_with('.')
                || WINDOWS_SHELL_FILES.contains(&component.to_lowercase().as_str())
        })
}

#[must_use]
pub fn is_page_image(path: &str) -> bool {
    has_extension(path, &PAGE_EXTENSIONS)
}

pub(crate) fn is_contained_page(path: &str) -> bool {
    !escapes_the_archive(path) && !is_ignored(path) && is_page_image(path)
}

pub(crate) fn is_fingerprinted_image(path: &str) -> bool {
    !is_ignored(path) && has_extension(path, &FINGERPRINTED_EXTENSIONS)
}

fn escapes_the_archive(path: &str) -> bool {
    path.starts_with(SEPARATORS) || path.split(SEPARATORS).any(|part| part == PARENT_FOLDER)
}

fn has_extension(path: &str, extensions: &[&str]) -> bool {
    Path::new(path)
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extensions.contains(&extension.to_lowercase().as_str()))
}
