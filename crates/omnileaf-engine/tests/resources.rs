#![expect(
    clippy::unwrap_used,
    reason = "each test opens its own library in a scratch folder, so a failed set-up should stop the test"
)]

#[expect(
    dead_code,
    reason = "these tests need scratch folders but none of the files support can put in them"
)]
mod support;

use std::{
    fs,
    path::{Path, PathBuf},
};

use omnileaf_engine::{CoverPath, Library, Resource, ResourceRouter};
use omnileaf_imaging::{Size, THUMBNAIL_WIDTH, thumbnail};
use omnileaf_testkit::{ArchiveEntry, Compression, PageShape, cbz, grainy_scan_jpeg, page_jpeg};
use support::{FixedClock, TempFolder};

const SEED: u64 = 21;
const PAGES: u32 = 3;
const FOLDER: &str = "Sample Library";
const BOOK: &str = "Sample Series 01/Sample Series 01 v01.cbz";
const FRONT_COVER_IS_THE_THIRD_PAGE: &str = r#"<?xml version="1.0"?>
<ComicInfo>
  <Pages>
    <Page Image="0" Type="Story" />
    <Page Image="2" Type="FrontCover" />
  </Pages>
</ComicInfo>"#;

struct Covers {
    library: Library,
    router: ResourceRouter,
    comics: TempFolder,
    cache: TempFolder,
    _home: TempFolder,
}

impl Covers {
    async fn with_book(name: &str, comic_info: Option<&str>) -> Self {
        let comics = TempFolder::new(&format!("{name}-comics"));
        write_book(&comics.path().join(FOLDER).join(BOOK), SEED, comic_info);
        let home = TempFolder::new(&format!("{name}-home"));
        let library = Library::open(home.path().to_path_buf(), FixedClock)
            .await
            .unwrap();
        library
            .add_folder(comics.path().join(FOLDER), |_| {})
            .await
            .unwrap();
        let cache = TempFolder::new(&format!("{name}-cache"));
        let router = ResourceRouter::open(cache.path()).unwrap();
        Self {
            library,
            router,
            comics,
            cache,
            _home: home,
        }
    }

    fn book_path(&self) -> PathBuf {
        self.comics.path().join(FOLDER).join(BOOK)
    }

    async fn cover(&self) -> CoverPath {
        let page = self.library.series(None).await.unwrap();
        page.series.first().unwrap().cover.unwrap()
    }

    async fn request(&self, path: &str) -> Resource {
        self.router.respond(&self.library, path).await
    }

    async fn request_cover(&self, cover: CoverPath) -> Resource {
        self.request(&format!("/{cover}")).await
    }

    fn reopen_router(&mut self) {
        self.router = ResourceRouter::open(self.cache.path()).unwrap();
    }

    /// The one thumbnail the cache holds, once a cover has been served.
    fn cached_thumbnail(&self) -> PathBuf {
        let mut entries = fs::read_dir(self.cache.path().join("thumbs").join("v1")).unwrap();
        let entry = entries.next().unwrap().unwrap().path();
        assert!(entries.next().is_none());
        entry
    }

    /// Serves the cover once so its thumbnail is cached, then damages that entry and restarts.
    async fn cached_then_damaged(&mut self, damage: impl FnOnce(&Path)) -> CoverPath {
        let cover = self.cover().await;
        self.request_cover(cover).await;
        damage(&self.cached_thumbnail());
        self.reopen_router();
        cover
    }
}

fn page(seed: u64, index: u32) -> Vec<u8> {
    page_jpeg(seed, index, PageShape::Portrait).unwrap()
}

fn write_book_of(path: &Path, pages: &[Vec<u8>]) {
    let entries: Vec<ArchiveEntry> = pages
        .iter()
        .enumerate()
        .map(|(index, bytes)| ArchiveEntry {
            name: format!("{:03}.jpg", index + 1),
            bytes: bytes.clone(),
        })
        .collect();
    fs::write(path, cbz(&entries, Compression::Stored).unwrap()).unwrap();
}

fn write_book(path: &Path, seed: u64, comic_info: Option<&str>) {
    let mut entries: Vec<ArchiveEntry> = (0..PAGES)
        .map(|index| ArchiveEntry {
            name: format!("{:03}.jpg", index + 1),
            bytes: page(seed, index),
        })
        .collect();
    entries.extend(comic_info.map(|xml| ArchiveEntry {
        name: "ComicInfo.xml".to_owned(),
        bytes: xml.as_bytes().to_vec(),
    }));
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, cbz(&entries, Compression::Stored).unwrap()).unwrap();
}

fn jpeg(body: Vec<u8>) -> Resource {
    Resource::Immutable {
        content_type: "image/jpeg",
        body,
    }
}

fn thumbnail_of(seed: u64, index: u32) -> Vec<u8> {
    thumbnail(&page(seed, index)).unwrap().jpeg
}

#[test]
fn leaves_its_cache_folder_alone_until_a_cover_is_asked_for() {
    let cache = TempFolder::new("untouched-cache");

    let router = ResourceRouter::open(cache.path());

    assert!(router.is_ok());
    assert_eq!(fs::read_dir(cache.path()).unwrap().count(), 0);
}

#[tokio::test]
async fn serves_a_cover_as_a_jpeg_the_webview_may_keep_for_good() {
    let covers = Covers::with_book("immutable", None).await;
    let cover = covers.cover().await;

    let resource = covers.request_cover(cover).await;

    assert!(
        matches!(
            resource,
            Resource::Immutable {
                content_type: "image/jpeg",
                ..
            }
        ),
        "{resource:?}"
    );
}

#[tokio::test]
async fn shows_the_first_page_of_a_book_without_comic_info() {
    let covers = Covers::with_book("first-page", None).await;
    let cover = covers.cover().await;

    let resource = covers.request_cover(cover).await;

    assert_eq!(resource, jpeg(thumbnail_of(SEED, 0)));
}

#[tokio::test]
async fn shows_the_page_comic_info_marks_as_the_front_cover() {
    let covers = Covers::with_book("front-cover", Some(FRONT_COVER_IS_THE_THIRD_PAGE)).await;
    let cover = covers.cover().await;

    let resource = covers.request_cover(cover).await;

    assert_eq!(resource, jpeg(thumbnail_of(SEED, 2)));
}

#[tokio::test]
async fn makes_a_320_by_480_jpeg_cover_from_a_grainy_full_colour_scan() {
    let covers = Covers::with_book("grainy-scan", None).await;
    let scan = grainy_scan_jpeg(SEED).unwrap();
    write_book_of(&covers.book_path(), std::slice::from_ref(&scan));
    covers.library.rescan_folders().await.unwrap();
    let expected = thumbnail(&scan).unwrap();

    let resource = covers.request_cover(covers.cover().await).await;

    assert_eq!(
        expected.size,
        Size {
            width: THUMBNAIL_WIDTH,
            height: 480
        }
    );
    assert_eq!(resource, jpeg(expected.jpeg));
}

#[tokio::test]
async fn finds_nothing_at_a_path_the_library_never_gave_out() {
    let covers = Covers::with_book("unknown-path", None).await;
    let cover = covers.cover().await.to_string();

    let resources = [
        covers.request("/").await,
        covers.request("/thumb/v1/not-a-book/1/1").await,
        covers
            .request(&format!("/{}", cover.replace("thumb", "page")))
            .await,
        covers.request(&format!("/{cover}/extra")).await,
    ];

    assert!(
        resources
            .iter()
            .all(|resource| *resource == Resource::NotFound),
        "{resources:?}"
    );
}

#[tokio::test]
async fn finds_nothing_at_a_cover_whose_file_changed_since_it_was_listed() {
    let covers = Covers::with_book("changed", None).await;
    let listed = covers.cover().await;
    write_book(&covers.book_path(), SEED + 1, None);
    covers.library.rescan_folders().await.unwrap();

    let stale = covers.request_cover(listed).await;
    let current = covers.request_cover(covers.cover().await).await;

    assert_eq!(stale, Resource::NotFound);
    assert_eq!(current, jpeg(thumbnail_of(SEED + 1, 0)));
}

#[tokio::test]
async fn fails_a_cover_whose_book_cannot_be_read() {
    let covers = Covers::with_book("unreadable", None).await;
    let cover = covers.cover().await;
    fs::write(covers.book_path(), b"no longer an archive").unwrap();

    let resource = covers.request_cover(cover).await;

    assert_eq!(resource, Resource::Failed);
}

#[tokio::test]
async fn still_serves_covers_when_its_cache_folder_cannot_be_made() {
    let mut covers = Covers::with_book("no-cache", None).await;
    let blocked = covers.cache.path().join("not-a-folder");
    fs::write(&blocked, b"a file where the cache folder should go").unwrap();
    covers.router = ResourceRouter::open(&blocked).unwrap();
    let cover = covers.cover().await;

    let resource = covers.request_cover(cover).await;

    assert_eq!(resource, jpeg(thumbnail_of(SEED, 0)));
}

#[tokio::test]
async fn serves_a_cover_made_before_from_its_cache_after_a_restart() {
    let mut covers = Covers::with_book("cached", None).await;
    let cover = covers.cover().await;
    covers.request_cover(cover).await;
    covers.reopen_router();
    fs::remove_file(covers.book_path()).unwrap();

    let resource = covers.request_cover(cover).await;

    assert_eq!(resource, jpeg(thumbnail_of(SEED, 0)));
}

#[cfg(unix)]
#[tokio::test]
async fn serves_a_cover_from_a_cached_thumbnail_it_may_only_read() {
    use std::os::unix::fs::PermissionsExt;
    const READ_ONLY: u32 = 0o444;
    let mut covers = Covers::with_book("read-only-entry", None).await;
    let cover = covers
        .cached_then_damaged(|entry| {
            fs::set_permissions(entry, fs::Permissions::from_mode(READ_ONLY)).unwrap();
        })
        .await;
    fs::remove_file(covers.book_path()).unwrap();

    let resource = covers.request_cover(cover).await;

    assert_eq!(resource, jpeg(thumbnail_of(SEED, 0)));
}

#[tokio::test]
async fn makes_a_cover_again_when_its_cached_thumbnail_came_back_empty() {
    let mut covers = Covers::with_book("emptied-entry", None).await;
    let cover = covers
        .cached_then_damaged(|entry| fs::write(entry, []).unwrap())
        .await;

    let resource = covers.request_cover(cover).await;

    assert_eq!(resource, jpeg(thumbnail_of(SEED, 0)));
}

#[tokio::test]
async fn makes_a_cover_again_when_its_cached_thumbnail_came_back_cut_short() {
    let mut covers = Covers::with_book("cut-short-entry", None).await;
    let cover = covers
        .cached_then_damaged(|entry| {
            let whole = fs::read(entry).unwrap();
            fs::write(entry, &whole[..whole.len() / 2]).unwrap();
        })
        .await;

    let resource = covers.request_cover(cover).await;

    assert_eq!(resource, jpeg(thumbnail_of(SEED, 0)));
    assert_eq!(
        fs::read(covers.cached_thumbnail()).unwrap(),
        thumbnail_of(SEED, 0)
    );
}

#[tokio::test]
async fn keeps_failing_a_cover_it_could_not_thumbnail_until_its_file_changes() {
    let covers = Covers::with_book("undecodable-page", None).await;
    let damaged_page = [0xFF, 0xD8, 0xFF, 0xC0, 0x00];
    write_book_of(&covers.book_path(), &[damaged_page.to_vec()]);
    covers.library.rescan_folders().await.unwrap();
    let damaged = covers.cover().await;
    let first = covers.request_cover(damaged).await;
    write_book(&covers.book_path(), SEED, None);

    let again = covers.request_cover(damaged).await;
    covers.library.rescan_folders().await.unwrap();
    let changed = covers.request_cover(covers.cover().await).await;

    assert_eq!([first, again], [Resource::Failed, Resource::Failed]);
    assert_eq!(changed, jpeg(thumbnail_of(SEED, 0)));
}
