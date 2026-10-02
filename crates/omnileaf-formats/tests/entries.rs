use omnileaf_formats::{is_ignored, is_page_image};

#[test]
fn ignores_system_files_and_hidden_entries() {
    for path in [
        "__MACOSX/page1.jpg",
        "Volume 1/__MACOSX/._page1.jpg",
        ".hidden.jpg",
        "pages/.DS_Store",
        "Thumbs.db",
        "pages/thumbs.db",
        "desktop.ini",
    ] {
        assert!(is_ignored(path), "{path} should be ignored");
    }
}

#[test]
fn keeps_ordinary_entries() {
    for path in [
        "page1.jpg",
        "Volume 1/page 01.png",
        "ComicInfo.xml",
        "./page1.jpg",
        "./Volume 1/page 01.png",
    ] {
        assert!(!is_ignored(path), "{path} should be kept");
    }
}

#[test]
fn recognises_page_images_by_extension_in_any_case() {
    for path in [
        "a.jpg",
        "a.JPEG",
        "a.png",
        "a.webp",
        "a.gif",
        "a.avif",
        "a.jxl",
        "a.bmp",
        "dir/b.PNG",
    ] {
        assert!(is_page_image(path), "{path} should be a page");
    }
}

#[test]
fn rejects_files_that_are_not_pages() {
    for path in ["ComicInfo.xml", "notes.txt", "page", "archive.cbz", "jpg"] {
        assert!(!is_page_image(path), "{path} should not be a page");
    }
}
