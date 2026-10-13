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

use omnileaf_engine::{
    BookId, BookReading, Library, LibraryListing, OpenBookError, OpenedBook, PageDimensions,
    ProbedFormat, ReadMark, ReadingDirection, Resource, ResourceRouter, SeriesBookListing,
    SeriesId,
};
use omnileaf_imaging::{Size, page_size};
use omnileaf_testkit::{
    ArchiveEntry, Compression, ENCODED_PAGE_HEIGHT, ENCODED_PAGE_WIDTH, INK_OVER_CLEAR_JXL,
    INK_OVER_PAPER_JXL, PageShape, cbz, page_jpeg, page_png, strip_jpeg, webp_header_only,
};
use support::{FixedClock, ScratchFolder};

const SEED: u64 = 31;
const PAGES: u32 = 5;
const FOLDER: &str = "Sample Library";
const SERIES: &str = "Sample Series 01";
const BOOK: &str = "Sample Series 01 v01";
const PORTRAIT: PageDimensions = PageDimensions {
    width: 400,
    height: 600,
};
const SPREAD: PageDimensions = PageDimensions {
    width: 800,
    height: 600,
};
const NOTHING_UNDECODABLE: Vec<ProbedFormat> = Vec::new();
/// A byte JPEG lets any marker begin with, which a decoder skips but the size reader here doesn't.
const FILL_BYTE: u8 = 0xFF;

struct Reader {
    library: Library,
    router: ResourceRouter,
    comics: ScratchFolder,
    cache: ScratchFolder,
    _home: ScratchFolder,
}

impl Reader {
    async fn with_pages(name: &str, pages: &[Vec<u8>]) -> Self {
        Self::with_books(name, &[(BOOK, pages.to_vec())]).await
    }

    /// A book stored without compression, for pages that deflate far enough to look like an archive bomb.
    async fn with_stored_pages(name: &str, pages: &[Vec<u8>]) -> Self {
        Self::with_books_compressed(name, &[(BOOK, pages.to_vec())], Compression::Stored).await
    }

    async fn with_books(name: &str, books: &[(&str, Vec<Vec<u8>>)]) -> Self {
        Self::with_books_compressed(name, books, Compression::Deflated).await
    }

    async fn with_books_compressed(
        name: &str,
        books: &[(&str, Vec<Vec<u8>>)],
        compression: Compression,
    ) -> Self {
        let comics = ScratchFolder::new(&format!("{name}-comics"));
        for (title, pages) in books {
            write_named_book(
                &comics.path().join(FOLDER).join(SERIES),
                (title, pages),
                compression,
            );
        }
        Self::over(name, comics).await
    }

    async fn with_comic_info(name: &str, comic_info: &[u8]) -> Self {
        let comics = ScratchFolder::new(&format!("{name}-comics"));
        let mut entries = page_entries(&portrait_pages(SEED));
        entries.push(ArchiveEntry {
            name: "ComicInfo.xml".to_owned(),
            bytes: comic_info.to_vec(),
        });
        write_cbz(
            &comics.path().join(FOLDER).join(SERIES),
            BOOK,
            &cbz(&entries, Compression::Deflated).unwrap(),
        );
        Self::over(name, comics).await
    }

    async fn over(name: &str, comics: ScratchFolder) -> Self {
        let home = ScratchFolder::new(&format!("{name}-home"));
        let library = Library::open(home.path().to_path_buf(), FixedClock)
            .await
            .unwrap();
        library
            .add_folder(comics.path().join(FOLDER), |_| {})
            .await
            .unwrap();
        let cache = ScratchFolder::new(&format!("{name}-cache"));
        let router = ResourceRouter::open(cache.path()).unwrap();
        Self {
            library,
            router,
            comics,
            cache,
            _home: home,
        }
    }

    async fn with_book(name: &str) -> Self {
        Self::with_pages(name, &portrait_pages(SEED)).await
    }

    fn fresh_router(&self) -> ResourceRouter {
        ResourceRouter::open(self.cache.path()).unwrap()
    }

    fn book_path(&self) -> PathBuf {
        self.comics
            .path()
            .join(FOLDER)
            .join(SERIES)
            .join(format!("{BOOK}.cbz"))
    }

    async fn series(&self) -> SeriesId {
        let listed = self
            .library
            .series(LibraryListing::default(), None)
            .await
            .unwrap();
        listed.series.first().unwrap().id
    }

    async fn book(&self) -> BookId {
        let books = self
            .library
            .series_books(self.series().await, SeriesBookListing::default(), None)
            .await
            .unwrap();
        books.books.first().unwrap().id
    }

    async fn open(&self, undecodable: Vec<ProbedFormat>) -> OpenedBook {
        let book = self.book().await;
        self.router
            .open_book(&self.library, book, undecodable)
            .await
            .unwrap()
    }

    async fn page(&self, opened: &OpenedBook, index: usize) -> Resource {
        let path = opened.pages.get(index).unwrap().path;
        self.router
            .respond(&self.library, &format!("/{path}"))
            .await
    }
}

fn portrait_pages(seed: u64) -> Vec<Vec<u8>> {
    (0..PAGES)
        .map(|index| page_jpeg(seed, index, PageShape::Portrait).unwrap())
        .collect()
}

fn write_book(series: &Path, pages: &[Vec<u8>]) {
    write_named_book(series, (BOOK, pages), Compression::Deflated);
}

fn write_named_book(series: &Path, (title, pages): (&str, &[Vec<u8>]), compression: Compression) {
    write_cbz(
        series,
        title,
        &cbz(&page_entries(pages), compression).unwrap(),
    );
}

fn page_entries(pages: &[Vec<u8>]) -> Vec<ArchiveEntry> {
    pages
        .iter()
        .enumerate()
        .map(|(index, bytes)| ArchiveEntry {
            name: format!("{:03}.img", index + 1).replace(".img", extension_of(bytes)),
            bytes: bytes.clone(),
        })
        .collect()
}

fn write_cbz(series: &Path, title: &str, archive: &[u8]) {
    fs::create_dir_all(series).unwrap();
    fs::write(series.join(format!("{title}.cbz")), archive).unwrap();
}

fn extension_of(bytes: &[u8]) -> &'static str {
    if bytes.starts_with(&[0xFF, 0xD8]) {
        ".jpg"
    } else if bytes.starts_with(&[0xFF, 0x0A]) {
        ".jxl"
    } else {
        ".png"
    }
}

fn gif_header(width: u16, height: u16) -> Vec<u8> {
    [
        &b"GIF89a"[..],
        &width.to_le_bytes(),
        &height.to_le_bytes(),
        &[0; 8],
    ]
    .concat()
}

fn served(content_type: &'static str, body: Vec<u8>) -> Resource {
    Resource::Immutable { content_type, body }
}

#[tokio::test]
async fn opens_a_book_with_its_series_and_every_page_in_reading_order() {
    let reader = Reader::with_book("opened").await;
    let book = reader.book().await;

    let opened = reader.open(NOTHING_UNDECODABLE).await;

    assert_eq!(opened.id, book);
    assert_eq!(opened.title, BOOK);
    assert_eq!(opened.series_title, SERIES);
    assert_eq!(opened.series, reader.series().await);
    assert_eq!(opened.reading, BookReading::NotStarted);
    assert_eq!(opened.start_page, 0);
    let paths: Vec<String> = opened
        .pages
        .iter()
        .map(|page| page.path.to_string())
        .collect();
    let expected: Vec<String> = (0..PAGES)
        .map(|index| format!("page/v1/{book}/1/{index}"))
        .collect();
    assert_eq!(paths, expected);
}

#[tokio::test]
async fn opens_a_book_with_its_place_in_the_series_and_the_books_either_side() {
    let titles = [
        "Sample Series 01 v01",
        "Sample Series 01 v02",
        "Sample Series 01 v03",
    ];
    let books: Vec<(&str, Vec<Vec<u8>>)> = (0_u64..)
        .zip(titles)
        .map(|(seed, title)| (title, portrait_pages(SEED + seed)))
        .collect();
    let reader = Reader::with_books("place", &books).await;
    let listed = reader
        .library
        .series_books(reader.series().await, SeriesBookListing::default(), None)
        .await
        .unwrap();
    let ids: Vec<BookId> = listed.books.iter().map(|book| book.id).collect();

    let middle = reader
        .router
        .open_book(&reader.library, ids[1], NOTHING_UNDECODABLE)
        .await
        .unwrap();

    assert_eq!(middle.position, 2);
    assert_eq!(
        middle
            .previous
            .map(|neighbour| (neighbour.id, neighbour.title)),
        Some((ids[0], titles[0].to_owned()))
    );
    assert_eq!(
        middle.next.map(|neighbour| (neighbour.id, neighbour.title)),
        Some((ids[2], titles[2].to_owned()))
    );
}

#[tokio::test]
async fn shows_the_next_book_by_its_own_cover_and_how_far_it_was_read() {
    let books: Vec<(&str, Vec<Vec<u8>>)> = vec![
        ("Sample Series 01 v01", portrait_pages(SEED)),
        ("Sample Series 01 v02", portrait_pages(SEED + 1)),
    ];
    let reader = Reader::with_books("next-cover", &books).await;
    let listed = reader
        .library
        .series_books(reader.series().await, SeriesBookListing::default(), None)
        .await
        .unwrap();
    let ids: Vec<BookId> = listed.books.iter().map(|book| book.id).collect();
    reader
        .library
        .mark_books(vec![ids[1]], ReadMark::Read)
        .await
        .unwrap();

    let first = reader
        .router
        .open_book(&reader.library, ids[0], NOTHING_UNDECODABLE)
        .await
        .unwrap();

    let next = first.next.unwrap();
    assert!(next.cover.is_some_and(|cover| {
        cover
            .to_string()
            .starts_with(&format!("thumb/v1/{}/", ids[1]))
    }));
    assert_eq!(next.reading, BookReading::Read);
}

#[tokio::test]
async fn reads_a_book_the_way_its_comic_info_says() {
    for (manga, direction) in [
        ("YesAndRightToLeft", Some(ReadingDirection::RightToLeft)),
        ("No", Some(ReadingDirection::LeftToRight)),
        ("Unknown", None),
    ] {
        let comic_info = format!("<ComicInfo><Manga>{manga}</Manga></ComicInfo>");
        let reader =
            Reader::with_comic_info(&format!("direction-{manga}"), comic_info.as_bytes()).await;

        let opened = reader.open(NOTHING_UNDECODABLE).await;

        assert_eq!(opened.reading_direction, direction, "{manga}");
    }
}

#[tokio::test]
async fn leaves_the_direction_unknown_for_a_book_without_comic_info() {
    let reader = Reader::with_book("no-comic-info").await;

    let opened = reader.open(NOTHING_UNDECODABLE).await;

    assert_eq!(opened.reading_direction, None);
}

#[tokio::test]
async fn opens_a_book_whose_comic_info_is_malformed_with_no_direction() {
    let reader = Reader::with_comic_info("bad-comic-info", b"<ComicInfo><Manga>Yes</Title>").await;

    let opened = reader.open(NOTHING_UNDECODABLE).await;

    assert_eq!(opened.reading_direction, None);
    assert_eq!(opened.pages.len(), PAGES as usize);
}

#[tokio::test]
async fn opens_a_book_alone_in_its_series_with_no_book_either_side() {
    let reader = Reader::with_book("alone").await;

    let opened = reader.open(NOTHING_UNDECODABLE).await;

    assert_eq!(opened.position, 1);
    assert_eq!(opened.previous, None);
    assert_eq!(opened.next, None);
}

#[tokio::test]
async fn gives_the_size_of_every_page_from_its_header() {
    let mut pages = portrait_pages(SEED);
    pages[2] = page_png(SEED, 2, PageShape::Spread).unwrap();
    let reader = Reader::with_pages("sizes", &pages).await;

    let opened = reader.open(NOTHING_UNDECODABLE).await;

    let sizes: Vec<Option<PageDimensions>> = opened.pages.iter().map(|page| page.size).collect();
    assert_eq!(
        sizes,
        [
            Some(PORTRAIT),
            Some(PORTRAIT),
            Some(SPREAD),
            Some(PORTRAIT),
            Some(PORTRAIT)
        ]
    );
}

#[tokio::test]
async fn gives_the_same_page_sizes_when_the_book_is_opened_again() {
    let reader = Reader::with_book("sizes-again").await;
    let first = reader.open(NOTHING_UNDECODABLE).await;

    let again = reader
        .fresh_router()
        .open_book(&reader.library, first.id, NOTHING_UNDECODABLE)
        .await
        .unwrap();

    assert_eq!(again.pages, first.pages);
}

#[tokio::test]
async fn reads_the_sizes_of_the_pages_far_from_the_start_after_the_book_opens() {
    const LONG_BOOK: u32 = 12;
    const FAR_PAGE: usize = 10;
    let mut pages: Vec<Vec<u8>> = (0..LONG_BOOK)
        .map(|index| page_jpeg(SEED, index, PageShape::Portrait).unwrap())
        .collect();
    pages[FAR_PAGE] = page_png(SEED, 10, PageShape::Spread).unwrap();
    let reader = Reader::with_pages("deferred-sizes", &pages).await;

    let first = reader.open(NOTHING_UNDECODABLE).await;
    let again = reader.open(NOTHING_UNDECODABLE).await;
    let after_a_restart = reader
        .fresh_router()
        .open_book(&reader.library, first.id, NOTHING_UNDECODABLE)
        .await
        .unwrap();

    assert_eq!(first.pages[0].size, Some(PORTRAIT));
    assert_eq!(first.pages[FAR_PAGE].size, None);
    assert_eq!(again.pages[FAR_PAGE].size, Some(SPREAD));
    assert!(again.pages.iter().all(|page| page.size.is_some()));
    assert_eq!(after_a_restart.pages, again.pages);
}

#[tokio::test]
async fn leaves_a_page_whose_header_cannot_be_read_without_a_size() {
    let mut pages = portrait_pages(SEED);
    pages[1] = b"\x89PNG\r\n\x1a\n not a header".to_vec();
    let reader = Reader::with_pages("unreadable-size", &pages).await;

    let opened = reader.open(NOTHING_UNDECODABLE).await;

    assert_eq!(opened.pages[0].size, Some(PORTRAIT));
    assert_eq!(opened.pages[1].size, None);
}

#[tokio::test]
async fn refuses_to_open_a_book_the_library_does_not_hold() {
    let reader = Reader::with_book("not-held").await;
    let book = reader.book().await;
    fs::remove_file(reader.book_path()).unwrap();
    write_book(
        &reader.comics.path().join(FOLDER).join("Sample Series 02"),
        &portrait_pages(SEED + 1),
    );
    reader.library.rescan_folders().await.unwrap();

    let opened = reader
        .router
        .open_book(&reader.library, book, NOTHING_UNDECODABLE)
        .await;

    assert!(
        matches!(opened, Err(OpenBookError::BookNotFound { id }) if id == book),
        "{opened:?}"
    );
}

#[tokio::test]
async fn refuses_to_open_a_book_whose_file_cannot_be_read() {
    let reader = Reader::with_book("unreadable-file").await;
    let book = reader.book().await;
    fs::write(reader.book_path(), b"no longer an archive").unwrap();

    let opened = reader
        .router
        .open_book(&reader.library, book, NOTHING_UNDECODABLE)
        .await;

    assert!(
        matches!(opened, Err(OpenBookError::Unreadable { .. })),
        "{opened:?}"
    );
}

#[tokio::test]
async fn serves_a_page_s_own_bytes_for_good() {
    let reader = Reader::with_book("original").await;
    let opened = reader.open(NOTHING_UNDECODABLE).await;

    let resource = reader.page(&opened, 3).await;

    assert_eq!(
        resource,
        served("image/jpeg", portrait_pages(SEED)[3].clone())
    );
}

#[tokio::test]
async fn serves_a_page_kept_in_memory_once_its_file_has_gone() {
    let reader = Reader::with_book("in-memory").await;
    let opened = reader.open(NOTHING_UNDECODABLE).await;
    reader.page(&opened, 0).await;
    fs::remove_file(reader.book_path()).unwrap();

    let resource = reader.page(&opened, 0).await;

    assert_eq!(
        resource,
        served("image/jpeg", portrait_pages(SEED)[0].clone())
    );
}

#[tokio::test]
async fn serves_a_page_asked_for_by_a_router_that_never_opened_its_book() {
    let reader = Reader::with_book("not-opened").await;
    let opened = reader.open(NOTHING_UNDECODABLE).await;
    let path = opened.pages[4].path;
    let fresh = reader.fresh_router();

    let resource = fresh.respond(&reader.library, &format!("/{path}")).await;

    assert_eq!(
        resource,
        served("image/jpeg", portrait_pages(SEED)[4].clone())
    );
}

#[tokio::test]
async fn finds_no_page_past_the_end_of_a_book_or_of_a_revision_since_replaced() {
    let reader = Reader::with_book("missing-pages").await;
    let opened = reader.open(NOTHING_UNDECODABLE).await;
    let book = opened.id;
    write_book(
        &reader.comics.path().join(FOLDER).join(SERIES),
        &portrait_pages(SEED + 1),
    );
    reader.library.rescan_folders().await.unwrap();
    let fresh = reader.fresh_router();

    let resources = [
        fresh
            .respond(&reader.library, &format!("/page/v1/{book}/1/{PAGES}"))
            .await,
        fresh
            .respond(&reader.library, &format!("/page/v1/{book}/1/0"))
            .await,
        fresh
            .respond(&reader.library, &format!("/page/v1/{book}/9/0"))
            .await,
    ];

    assert_eq!(
        resources,
        [Resource::NotFound, Resource::NotFound, Resource::NotFound]
    );
}

#[tokio::test]
async fn serves_a_jpeg_xl_page_as_it_is_to_a_webview_that_shows_jpeg_xl() {
    let mut pages = portrait_pages(SEED);
    pages[0] = INK_OVER_PAPER_JXL.to_vec();
    let reader = Reader::with_pages("jxl-shown", &pages).await;
    let opened = reader.open(NOTHING_UNDECODABLE).await;

    let resource = reader.page(&opened, 0).await;

    assert_eq!(resource, served("image/jxl", INK_OVER_PAPER_JXL.to_vec()));
    assert_eq!(
        opened.pages[0].size,
        Some(PageDimensions {
            width: ENCODED_PAGE_WIDTH,
            height: ENCODED_PAGE_HEIGHT
        })
    );
}

#[tokio::test]
async fn transcodes_a_jpeg_xl_page_for_a_webview_that_cannot_show_it() {
    let mut pages = portrait_pages(SEED);
    pages[0] = INK_OVER_PAPER_JXL.to_vec();
    let reader = Reader::with_pages("jxl-transcoded", &pages).await;
    let opened = reader.open(vec![ProbedFormat::Jxl]).await;

    let resource = reader.page(&opened, 0).await;

    let Resource::Immutable { content_type, body } = resource else {
        panic!("{resource:?}");
    };
    assert_eq!(content_type, "image/jpeg");
    assert!(body.starts_with(&[0xFF, 0xD8, 0xFF]));
}

#[tokio::test]
async fn serves_a_transcode_kept_on_disk_after_a_restart_without_transcoding_again() {
    let mut pages = portrait_pages(SEED);
    pages[0] = INK_OVER_PAPER_JXL.to_vec();
    let reader = Reader::with_pages("jxl-kept", &pages).await;
    let opened = reader.open(vec![ProbedFormat::Jxl]).await;
    let first = reader.page(&opened, 0).await;
    pages[0] = INK_OVER_CLEAR_JXL.to_vec();
    write_book(&reader.comics.path().join(FOLDER).join(SERIES), &pages);
    let fresh = reader.fresh_router();
    fresh
        .open_book(&reader.library, opened.id, vec![ProbedFormat::Jxl])
        .await
        .unwrap();

    let again = fresh
        .respond(&reader.library, &format!("/{}", opened.pages[0].path))
        .await;

    assert!(
        matches!(
            first,
            Resource::Immutable {
                content_type: "image/jpeg",
                ..
            }
        ),
        "{first:?}"
    );
    assert_eq!(again, first);
}

#[tokio::test]
async fn fails_a_page_that_is_no_image() {
    let mut pages = portrait_pages(SEED);
    pages[1] = b"not an image of any kind".to_vec();
    let reader = Reader::with_pages("not-an-image", &pages).await;
    let opened = reader.open(NOTHING_UNDECODABLE).await;

    let resource = reader.page(&opened, 1).await;

    assert_eq!(resource, Resource::Failed);
}

#[tokio::test]
async fn refuses_a_page_whose_header_claims_more_pixels_than_a_webview_can_draw() {
    let mut pages = portrait_pages(SEED);
    pages[1] = gif_header(u16::MAX, u16::MAX);
    pages[2] = webp_header_only(16_384, 16_384);
    let reader = Reader::with_pages("hostile-header", &pages).await;
    let opened = reader.open(NOTHING_UNDECODABLE).await;

    let resources = [reader.page(&opened, 1).await, reader.page(&opened, 2).await];

    assert_eq!(resources, [Resource::Failed, Resource::Failed]);
}

#[tokio::test]
async fn serves_a_long_strip_as_it_is() {
    let strip = gif_header(1080, 30_000);
    let mut pages = portrait_pages(SEED);
    pages[1] = strip.clone();
    let reader = Reader::with_pages("long-strip", &pages).await;
    let opened = reader.open(NOTHING_UNDECODABLE).await;

    let resource = reader.page(&opened, 1).await;

    assert_eq!(resource, served("image/gif", strip));
}

#[tokio::test]
async fn serves_a_thumbnail_of_a_page_at_the_filmstrip_size_kept_on_disk_for_next_time() {
    let reader = Reader::with_book("page-thumbnail").await;
    let opened = reader.open(NOTHING_UNDECODABLE).await;
    let thumbnail = format!("/{}", opened.pages[2].thumbnail);

    let first = reader.router.respond(&reader.library, &thumbnail).await;
    fs::remove_file(reader.book_path()).unwrap();
    let again = reader
        .fresh_router()
        .respond(&reader.library, &thumbnail)
        .await;

    let Resource::Immutable { content_type, body } = &first else {
        panic!("{first:?}");
    };
    assert_eq!(*content_type, "image/jpeg");
    assert_eq!(
        page_size(body).unwrap(),
        Size {
            width: 160,
            height: 240
        }
    );
    assert_eq!(again, first);
}

#[tokio::test]
async fn finds_no_thumbnail_of_a_page_of_a_revision_since_replaced() {
    let reader = Reader::with_book("page-thumbnail-replaced").await;
    let opened = reader.open(NOTHING_UNDECODABLE).await;

    let resource = reader
        .router
        .respond(
            &reader.library,
            &format!("/page-thumb/v1/{}/9/0", opened.id),
        )
        .await;

    assert_eq!(resource, Resource::NotFound);
}

#[tokio::test]
async fn serves_a_page_as_it_is_when_its_header_does_not_give_its_size() {
    let mut odd = page_jpeg(SEED, 1, PageShape::Portrait).unwrap();
    odd.insert(2, FILL_BYTE);
    let mut pages = portrait_pages(SEED);
    pages[1] = odd.clone();
    let reader = Reader::with_pages("unsized-page", &pages).await;
    let opened = reader.open(NOTHING_UNDECODABLE).await;

    let resource = reader.page(&opened, 1).await;

    assert!(page_size(&odd).is_err());
    assert_eq!(resource, served("image/jpeg", odd));
}

#[tokio::test]
async fn shrinks_a_jpeg_strip_with_more_pixels_than_a_webview_can_draw_to_half_its_size() {
    let mut pages = portrait_pages(SEED);
    pages[1] = strip_jpeg(800, 50_100).unwrap();
    let reader = Reader::with_stored_pages("long-jpeg-strip", &pages).await;
    let opened = reader.open(NOTHING_UNDECODABLE).await;

    let resource = reader.page(&opened, 1).await;

    let Resource::Immutable { content_type, body } = &resource else {
        panic!("{resource:?}");
    };
    assert_eq!(*content_type, "image/jpeg");
    assert_eq!(
        page_size(body).unwrap(),
        Size {
            width: 400,
            height: 25_050
        }
    );
}
