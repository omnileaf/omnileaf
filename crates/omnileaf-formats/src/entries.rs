use std::path::Path;

const IGNORED_FOLDER: &str = "__MACOSX";
const IGNORED_FILES: [&str; 2] = ["thumbs.db", "desktop.ini"];
const PAGE_EXTENSIONS: [&str; 8] = ["jpg", "jpeg", "png", "webp", "gif", "avif", "jxl", "bmp"];

/// Whether an archive or folder entry is system clutter rather than content: macOS resource forks, hidden files and Windows thumbnails.
#[must_use]
pub fn is_ignored(path: &str) -> bool {
    path.split(['/', '\\']).any(|component| {
        component == IGNORED_FOLDER
            || component.starts_with('.')
            || IGNORED_FILES.contains(&component.to_lowercase().as_str())
    })
}

#[must_use]
pub fn is_page_image(path: &str) -> bool {
    Path::new(path)
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| PAGE_EXTENSIONS.contains(&extension.to_lowercase().as_str()))
}
