use std::{
    collections::HashSet,
    io,
    num::NonZeroUsize,
    path::PathBuf,
    sync::{Arc, Mutex, MutexGuard, OnceLock, PoisonError, RwLock},
};

use omnileaf_cache::{CacheError, CacheKey, DiskCache, MemoryCache};
use omnileaf_db::catalog::{self, BookReading as StoredReading};
use omnileaf_formats::{Book, FormatError};
use omnileaf_imaging::{ImagingError, PageFormat, page_size, transcode};

use crate::{
    BookId, BookPage, Library, LibraryError, OpenedBook, PagePath, ProbedFormat, SeriesId,
    describe_error,
    device_class::{IS_MOBILE, MEBIBYTE},
    lane::{Job, LaneStopped},
    library::BookToOpen,
    open_books::{BookFileAt, OpenBook, OpenBooks, PageAt},
    page_lane::{AskedPageError, PageLane},
};

/// Changes whenever pages are transcoded differently, so no transcode made the old way is served again.
pub(crate) const PAGE_CACHE_VERSION: &str = "v1";
const MEMORY_BUDGET_BYTES: u64 = (if IS_MOBILE { 48 } else { 256 }) * MEBIBYTE as u64;
const TRANSCODE_BUDGET_BYTES: u64 = (if IS_MOBILE { 128 } else { 512 }) * MEBIBYTE as u64;
const PAGES_READ_AHEAD: usize = 4;
/// Enough of a page for its header to give its size, unless metadata comes first and pushes the header further in.
const SIZE_PROBE_BYTES: u64 = 32 * 1024;
const WORKERS: NonZeroUsize = if IS_MOBILE {
    NonZeroUsize::MIN
} else {
    NonZeroUsize::MIN.saturating_add(1)
};
const WORKER_NAME: &str = "omnileaf-pages";

/// A page as the `omni` protocol hands it to the webview.
pub(crate) struct ServedPage {
    pub(crate) content_type: &'static str,
    pub(crate) bytes: Vec<u8>,
}

/// The pages of the books being read: kept in memory under a byte budget, read ahead of the reader and transcoded where the webview needs it.
pub(crate) struct Pages {
    lane: PageLane,
    shared: Arc<Shared>,
}

struct Shared {
    memory: Mutex<MemoryCache<PagePath, ServedPage>>,
    books: OpenBooks,
    undecodable: RwLock<HashSet<ProbedFormat>>,
    transcode_folder: PathBuf,
    transcodes: OnceLock<Option<DiskCache>>,
}

#[derive(Debug, thiserror::Error)]
pub enum OpenBookError {
    #[error("book {id} isn't in the library")]
    BookNotFound { id: BookId },
    #[error("read book {id} from a folder this build can't open")]
    FolderClosed { id: BookId },
    #[error("read the file of book {id}")]
    Unreadable {
        id: BookId,
        #[source]
        source: FormatError,
    },
    #[error("find the book in the library")]
    Library(#[from] LibraryError),
    #[error("open the book on the page lane")]
    Lane(#[from] LaneStopped),
}

#[derive(Debug, thiserror::Error)]
pub(crate) enum PageError {
    #[error("find the page's book")]
    Library(#[from] LibraryError),
    #[error("read the page's book")]
    Format(#[from] FormatError),
    #[error("serve a page that isn't an image in a format pages are kept in")]
    NotAnImage,
    #[error("transcode the page")]
    Transcode(#[from] ImagingError),
    #[error("name the page's transcode in the cache")]
    CacheKey(#[from] CacheError),
    #[error("open the page's book on the page lane")]
    Lane(#[from] LaneStopped),
    #[error("read the page on the page lane")]
    Asked(#[from] AskedPageError),
}

impl PageError {
    /// Whether the reader asked for newer pages before this one's turn came, so nobody waits for it any more.
    pub(crate) fn is_superseded(&self) -> bool {
        matches!(self, Self::Asked(AskedPageError::Superseded))
    }
}

impl Pages {
    /// Leaves the transcode folder alone until a page needs transcoding.
    pub(crate) fn open(transcode_folder: PathBuf) -> io::Result<Self> {
        Ok(Self {
            lane: PageLane::start(WORKER_NAME, WORKERS)?,
            shared: Arc::new(Shared {
                memory: Mutex::new(MemoryCache::new(MEMORY_BUDGET_BYTES)),
                books: OpenBooks::default(),
                undecodable: RwLock::default(),
                transcode_folder,
                transcodes: OnceLock::new(),
            }),
        })
    }

    /// Opens the book's file, reading and storing the size of each page the first time, and starts reading ahead from where reading goes on.
    pub(crate) async fn open_book(
        &self,
        library: &Library,
        id: BookId,
        undecodable: Vec<ProbedFormat>,
    ) -> Result<OpenedBook, OpenBookError> {
        *self
            .shared
            .undecodable
            .write()
            .unwrap_or_else(PoisonError::into_inner) = undecodable.into_iter().collect();
        let to_open = library
            .book_to_open(id)
            .await?
            .ok_or(OpenBookError::BookNotFound { id })?;
        let found = &to_open.found;
        let stored = library.page_dimensions(found.file, found.rev).await?;
        let file = BookFileAt {
            book: found.id,
            rev: found.rev,
        };
        let shared = Arc::clone(&self.shared);
        let located = library
            .book_file(found)
            .ok_or(OpenBookError::FolderClosed { id })?;
        let (opened, sizes, is_probed) = self
            .lane
            .run(move || {
                let opened = shared.books.open(file, &located)?;
                Ok::<_, FormatError>(match stored {
                    Some(sizes) if sizes.len() == opened.page_count => (opened, sizes, false),
                    _ => {
                        let sizes = probe_sizes(&mut opened.lock());
                        (opened, sizes, true)
                    }
                })
            })
            .await?
            .map_err(|source| OpenBookError::Unreadable { id, source })?;
        if is_probed
            && let Err(error) = library
                .store_page_dimensions(found.file, found.rev, sizes.clone())
                .await
        {
            tracing::warn!(error = %describe_error(&error), "keep the size of each page for the next time the book opens");
        }
        let start = start_page(found.reading, opened.page_count);
        self.read_ahead(&opened, usize::try_from(start).unwrap_or(usize::MAX));
        Ok(opened_book(to_open, &sizes, start))
    }

    /// The page, or nothing for a page of a revision the library no longer holds or past the end of its book.
    pub(crate) async fn page(
        &self,
        library: &Library,
        path: PagePath,
    ) -> Result<Option<Arc<ServedPage>>, PageError> {
        let file = BookFileAt {
            book: path.book,
            rev: path.rev,
        };
        let kept = self.shared.memory().get(&path);
        let opened = match self.shared.books.get(file) {
            Some(opened) => opened,
            None if kept.is_some() => return Ok(kept),
            None => match library.book_to_read(BookId(path.book)).await? {
                Some(found) if found.rev == path.rev => {
                    let Some(stored) = library.book_file(&found) else {
                        return Ok(None);
                    };
                    let shared = Arc::clone(&self.shared);
                    self.lane
                        .run(move || shared.books.open(file, &stored))
                        .await??
                }
                _ => return Ok(None),
            },
        };
        let Some(page) = opened.page(path.index) else {
            return Ok(None);
        };
        let served = if let Some(served) = kept {
            served
        } else {
            let shared = Arc::clone(&self.shared);
            let reading = opened.clone();
            self.lane
                .read_page(move || shared.serve(&reading, page))
                .await??
        };
        self.read_ahead(&opened, page.index.saturating_add(1));
        Ok(Some(served))
    }

    /// Replaces the reading ahead still waiting with the pages from `first` on that memory doesn't hold yet.
    fn read_ahead(&self, opened: &OpenBook, first: usize) {
        let memory = self.shared.memory();
        let jobs = (first..opened.page_count)
            .take(PAGES_READ_AHEAD)
            .filter_map(|index| {
                let page = opened.page(u32::try_from(index).ok()?)?;
                (!memory.contains(&page.path)).then_some(page)
            })
            .map(|page| -> Job {
                let shared = Arc::clone(&self.shared);
                let opened = opened.clone();
                Box::new(move || {
                    if let Err(error) = shared.serve(&opened, page) {
                        tracing::debug!(path = %page.path, error = %describe_error(&error), "read a page ahead");
                    }
                })
            })
            .collect();
        drop(memory);
        self.lane.prefetch(jobs);
    }
}

impl Shared {
    fn memory(&self) -> MutexGuard<'_, MemoryCache<PagePath, ServedPage>> {
        self.memory.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Reads the page into memory unless another job read it meanwhile, holding the book so two jobs never read the same page at once.
    fn serve(&self, opened: &OpenBook, page: PageAt) -> Result<Arc<ServedPage>, PageError> {
        let PageAt { path, index } = page;
        let bytes = {
            let mut book = opened.lock();
            if let Some(page) = self.memory().get(&path) {
                return Ok(page);
            }
            book.read_page(index)?
        };
        let page = Arc::new(self.prepared(path, bytes)?);
        let weight = u64::try_from(page.bytes.len()).unwrap_or(u64::MAX);
        self.memory().insert(path, Arc::clone(&page), weight);
        Ok(page)
    }

    /// The page's own bytes, or a transcode of them in a format the webview shows.
    fn prepared(&self, path: PagePath, bytes: Vec<u8>) -> Result<ServedPage, PageError> {
        let format = PageFormat::sniff(&bytes).ok_or(PageError::NotAnImage)?;
        if !self.needs_transcoding(format) {
            return Ok(ServedPage {
                content_type: format.content_type(),
                bytes,
            });
        }
        let key: CacheKey = format!("{}-{}-{}", path.book, path.rev, path.index).parse()?;
        let cache = self.transcodes();
        if let Some(cached) = cache.and_then(|cache| cache.get(&key))
            && let Some(format) = PageFormat::sniff(&cached)
        {
            return Ok(ServedPage {
                content_type: format.content_type(),
                bytes: cached,
            });
        }
        let transcoded = transcode(&bytes)?;
        if let Some(Err(error)) = cache.map(|cache| cache.put(&key, &transcoded.bytes)) {
            tracing::warn!(%path, error = %describe_error(&error), "keep a transcoded page for next time");
        }
        Ok(ServedPage {
            content_type: transcoded.format.content_type(),
            bytes: transcoded.bytes,
        })
    }

    fn needs_transcoding(&self, format: PageFormat) -> bool {
        let undecodable = self
            .undecodable
            .read()
            .unwrap_or_else(PoisonError::into_inner);
        ProbedFormat::of(format).is_some_and(|probed| undecodable.contains(&probed))
    }

    /// The transcode cache, opened by whichever page needs it first, or nothing when it can't be opened.
    fn transcodes(&self) -> Option<&DiskCache> {
        self.transcodes
            .get_or_init(
                || match DiskCache::open(self.transcode_folder.clone(), TRANSCODE_BUDGET_BYTES) {
                    Ok(cache) => Some(cache),
                    Err(error) => {
                        tracing::warn!(error = %describe_error(&error), "open the transcoded page cache, so pages are transcoded afresh each time");
                        None
                    }
                },
            )
            .as_ref()
    }
}

/// The page reading goes on from, counting from 0, or the first page of a book not started.
fn start_page(reading: StoredReading, page_count: usize) -> u32 {
    let last = u32::try_from(page_count.saturating_sub(1)).unwrap_or(u32::MAX);
    match reading {
        StoredReading::Started {
            position_page: Some(page),
        } => page.min(last),
        StoredReading::Started {
            position_page: None,
        }
        | StoredReading::NotStarted
        | StoredReading::Read => 0,
    }
}

fn probe_sizes(book: &mut Book) -> Vec<Option<catalog::PageDimensions>> {
    (0..book.pages().len())
        .map(|index| match probe_size(book, index) {
            Ok(size) => Some(size),
            Err(error) => {
                tracing::debug!(index, error = %describe_error(error.as_ref()), "read the size of a page");
                None
            }
        })
        .collect()
}

/// Reads the size from the start of the page, or from the whole page when its header runs further in.
fn probe_size(
    book: &mut Book,
    index: usize,
) -> Result<catalog::PageDimensions, Box<dyn std::error::Error + Send + Sync>> {
    let start = book.read_page_start(index, SIZE_PROBE_BYTES)?;
    let size = match page_size(&start) {
        Err(ImagingError::Truncated) => page_size(&book.read_page(index)?)?,
        read => read?,
    };
    Ok(catalog::PageDimensions {
        width: size.width,
        height: size.height,
    })
}

fn opened_book(
    BookToOpen { found, place }: BookToOpen,
    sizes: &[Option<catalog::PageDimensions>],
    start_page: u32,
) -> OpenedBook {
    let pages = (0_u32..)
        .zip(sizes)
        .map(|(index, size)| BookPage {
            path: PagePath {
                book: found.id,
                rev: found.rev,
                index,
            },
            size: size.map(Into::into),
        })
        .collect();
    OpenedBook {
        id: BookId(found.id),
        title: found.title,
        series: SeriesId(found.series),
        series_title: found.series_title,
        pages,
        start_page,
        reading: found.reading.into(),
        position: place.position,
        previous: place.previous.map(Into::into),
        next: place.next.map(Into::into),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const PAGE_COUNT: usize = 30;

    fn started_at(position_page: Option<u32>) -> StoredReading {
        StoredReading::Started { position_page }
    }

    #[test]
    fn opens_a_started_book_on_the_page_reading_goes_on_from() {
        let start = start_page(started_at(Some(13)), PAGE_COUNT);

        assert_eq!(start, 13);
    }

    #[test]
    fn opens_on_the_last_page_a_book_whose_position_is_past_its_end() {
        let start = start_page(started_at(Some(40)), PAGE_COUNT);

        assert_eq!(start, 29);
    }

    #[test]
    fn opens_on_the_first_page_a_book_with_no_position_to_go_on_from() {
        let starts = [
            StoredReading::NotStarted,
            started_at(None),
            StoredReading::Read,
        ]
        .map(|reading| start_page(reading, PAGE_COUNT));

        assert_eq!(starts, [0, 0, 0]);
    }

    #[test]
    fn opens_a_book_with_no_pages_on_its_first_page() {
        let start = start_page(started_at(Some(3)), 0);

        assert_eq!(start, 0);
    }
}
