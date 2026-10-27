#![expect(
    clippy::unwrap_used,
    reason = "the library is a generated fixture, so a failed set-up should stop the test"
)]

use std::{fs, path::Path, vec::IntoIter};

use omnileaf_engine::{
    BookId, Library, LibraryListing, OpenedBook, PagePath, Resource, ResourceRouter,
    SeriesBookListing,
};
use omnileaf_testkit::{ArchiveEntry, Compression, FixtureError, cbz};

use crate::support::{FixedClock, ScratchFolder};

pub(crate) const BOOKS: u64 = 40;
const PAGES_PER_BOOK: usize = 30;

pub(crate) fn write_scanned_library(
    root: &Path,
    draw_scan: impl Fn(u64) -> Result<Vec<u8>, FixtureError>,
) {
    for book in 0..BOOKS {
        let series = format!("Sample Series {book:02}");
        let scan = draw_scan(book).unwrap();
        let entries: Vec<ArchiveEntry> = (0..PAGES_PER_BOOK)
            .map(|index| ArchiveEntry {
                name: format!("{index:03}.jpg"),
                bytes: scan.clone(),
            })
            .collect();
        let folder = root.join(&series);
        fs::create_dir_all(&folder).unwrap();
        fs::write(
            folder.join(format!("{series} v01.cbz")),
            cbz(&entries, Compression::Stored).unwrap(),
        )
        .unwrap();
    }
}

async fn every_book(library: &Library) -> Vec<BookId> {
    let mut books = Vec::new();
    let mut after = None;
    loop {
        let page = library
            .series(LibraryListing::default(), after)
            .await
            .unwrap();
        for series in &page.series {
            let listed = library
                .series_books(series.id, SeriesBookListing::default(), None)
                .await
                .unwrap();
            books.extend(listed.books.into_iter().map(|book| book.id));
        }
        match page.next {
            Some(next) => after = Some(next),
            None => return books,
        }
    }
}

pub(crate) struct UnopenedBooks {
    library: Library,
    books: IntoIter<BookId>,
    _home: ScratchFolder,
}

impl UnopenedBooks {
    pub(crate) async fn of(comics: &Path, pass: &str) -> Self {
        let home = ScratchFolder::new(&format!("unopened-books-home-{pass}"));
        let library = Library::open(home.path().to_path_buf(), FixedClock)
            .await
            .unwrap();
        library
            .add_folder(comics.to_path_buf(), |_| {})
            .await
            .unwrap();
        let books = every_book(&library).await;
        assert_eq!(books.len(), usize::try_from(BOOKS).unwrap());
        Self {
            library,
            books: books.into_iter(),
            _home: home,
        }
    }

    pub(crate) async fn open_next(&mut self, router: &ResourceRouter) -> OpenedBook {
        let book = self.books.next().unwrap();
        let opened = router
            .open_book(&self.library, book, Vec::new())
            .await
            .unwrap();
        assert_eq!(opened.pages.len(), PAGES_PER_BOOK);
        opened
    }

    pub(crate) async fn serve(&self, router: &ResourceRouter, page: PagePath) -> Resource {
        router.respond(&self.library, &format!("/{page}")).await
    }
}

pub(crate) struct ColdRouter {
    pub(crate) router: ResourceRouter,
    _cache: ScratchFolder,
}

impl ColdRouter {
    pub(crate) fn open() -> Self {
        let cache = ScratchFolder::new("unopened-books-cache");
        Self {
            router: ResourceRouter::open(cache.path()).unwrap(),
            _cache: cache,
        }
    }
}
