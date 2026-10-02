use std::path::Path;

const IGNORED_FOLDER: &str = "__MACOSX";
const CURRENT_FOLDER: &str = ".";
const IGNORED_FILES: [&str; 2] = ["thumbs.db", "desktop.ini"];
const PAGE_EXTENSIONS: [&str; 8] = ["jpg", "jpeg", "png", "webp", "gif", "avif", "jxl", "bmp"];
const FINGERPRINTED_EXTENSIONS: [&str; 12] = [
    "jpg", "jpeg", "png", "webp", "avif", "jxl", "gif", "bmp", "tif", "tiff", "heic", "heif",
];

/// Whether an archive or folder entry is system clutter rather than content: macOS resource forks, hidden files and Windows thumbnails.
#[must_use]
pub fn is_ignored(path: &str) -> bool {
    path.split(['/', '\\'])
        .filter(|component| *component != CURRENT_FOLDER)
        .any(|component| {
            component == IGNORED_FOLDER
                || component.starts_with('.')
                || IGNORED_FILES.contains(&component.to_lowercase().as_str())
        })
}

#[must_use]
pub fn is_page_image(path: &str) -> bool {
    has_extension(path, &PAGE_EXTENSIONS)
}

/// Whether an entry counts toward the book's fingerprint, which takes every image format the identity contract names, shown as a page or not.
pub(crate) fn is_fingerprinted_image(path: &str) -> bool {
    !is_ignored(path) && has_extension(path, &FINGERPRINTED_EXTENSIONS)
}

fn has_extension(path: &str, extensions: &[&str]) -> bool {
    Path::new(path)
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extensions.contains(&extension.to_lowercase().as_str()))
}
