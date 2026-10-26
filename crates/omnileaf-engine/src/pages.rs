use std::{
    collections::HashSet,
    io,
    num::NonZeroUsize,
    ops::Range,
    path::PathBuf,
    sync::{Arc, Condvar, Mutex, MutexGuard, OnceLock, PoisonError, RwLock},
};

use omnileaf_cache::{CacheError, DiskCache, MemoryCache};
use omnileaf_db::catalog::{BookFileId, BookReading as StoredReading};
use omnileaf_formats::{Book, FormatError};
use omnileaf_imaging::{
    CroppedSides, ImagingError, PageFormat, Transcoded, crop_side_borders, crop_white_borders,
    page_size, shrink_page, transcode,
};
use tokio::sync::oneshot;

use crate::{
    BookDamage, BookId, BookPage, Library, LibraryError, OpenedBook, PageCrop, PagePath,
    PageThumbnailPath, ProbedFormat, ReadingDirection, SeriesId,
    decode_permits::DecodePermits,
    describe_error,
    device_class::{IS_MOBILE, MEBIBYTE},
    file_type::FileType,
    lane::{Job, LaneStopped},
    library::BookToOpen,
    open_books::{BookFileAt, OpenBook, OpenBooks, PageAt},
    page_lane::{AskedPageError, PageLane},
    page_sizes::{PageSizes, SizeFill, SizeFills, fill_sizes, opening_window, probe_window},
    side_borders::book_side_borders,
};

/// Changes whenever pages are transcoded differently, so no transcode made the old way is served again.
pub(crate) const PAGE_CACHE_VERSION: &str = "v1";
const MEMORY_BUDGET_BYTES: u64 = (if IS_MOBILE { 48 } else { 256 }) * MEBIBYTE as u64;
const TRANSCODE_BUDGET_BYTES: u64 = (if IS_MOBILE { 128 } else { 512 }) * MEBIBYTE as u64;
const PAGES_READ_AHEAD: usize = 4;
/// Android's webview decodes no image past a 25th of the device's memory, about 40 megapixels at four bytes each on a 4 GB phone, so a page past it is shrunk or refused rather than left to end the renderer.
const PAGE_PIXEL_BUDGET: u64 = 40_000_000;
pub(crate) const WORKERS: NonZeroUsize = if IS_MOBILE {
    NonZeroUsize::MIN
} else {
    NonZeroUsize::MIN.saturating_add(1)
};
const WORKER_NAME: &str = "omnileaf-pages";

pub(crate) struct ServedPage {
    pub(crate) content_type: &'static str,
    pub(crate) bytes: Vec<u8>,
}

pub(crate) struct Pages {
    lane: PageLane,
    shared: Arc<Shared>,
}

struct Shared {
    memory: Mutex<MemoryCache<PagePath, ServedPage>>,
    in_flight: PagesInFlight,
    books: OpenBooks,
    size_fills: SizeFills,
    undecodable: RwLock<HashSet<ProbedFormat>>,
    transcode_folder: PathBuf,
    transcodes: OnceLock<Option<DiskCache>>,
    decodes: Arc<DecodePermits>,
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
    #[error("read the {file_type} file of book {id}, a type this build can't read")]
    UnsupportedType {
        id: BookId,
        file_type: FileType,
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

impl OpenBookError {
    fn unreadable(id: BookId, file_type: Option<FileType>, source: FormatError) -> Self {
        let is_archive_not_read_yet = matches!(source, FormatError::ArchiveNotSupportedYet { .. });
        match file_type {
            Some(file_type) if is_archive_not_read_yet && !file_type.is_read() => {
                Self::UnsupportedType {
                    id,
                    file_type,
                    source,
                }
            }
            Some(_) | None => Self::Unreadable { id, source },
        }
    }
}

impl PageError {
    pub(crate) fn is_superseded(&self) -> bool {
        matches!(self, Self::Asked(AskedPageError::Superseded))
    }
}

impl Pages {
    pub(crate) fn open(transcode_folder: PathBuf, decodes: Arc<DecodePermits>) -> io::Result<Self> {
        Ok(Self {
            lane: PageLane::start(WORKER_NAME, WORKERS)?,
            shared: Arc::new(Shared {
                memory: Mutex::new(MemoryCache::new(MEMORY_BUDGET_BYTES)),
                in_flight: PagesInFlight::default(),
                books: OpenBooks::default(),
                size_fills: SizeFills::default(),
                undecodable: RwLock::default(),
                transcode_folder,
                transcodes: OnceLock::new(),
                decodes,
            }),
        })
    }

    pub(crate) async fn cached_bytes(&self) -> u64 {
        self.with_transcodes(DiskCache::stored_bytes).await
    }

    pub(crate) async fn clear_cached(&self) -> u64 {
        self.with_transcodes(DiskCache::clear).await
    }

    pub(crate) async fn trim_cached(&self, bytes: u64) -> u64 {
        self.with_transcodes(move |cache| cache.trim_oldest(bytes))
            .await
    }

    async fn with_transcodes(&self, work: impl FnOnce(&DiskCache) -> u64 + Send + 'static) -> u64 {
        let shared = Arc::clone(&self.shared);
        tokio::task::spawn_blocking(move || shared.transcodes().map_or(0, work))
            .await
            .unwrap_or_else(|error| {
                tracing::warn!(%error, "reach the transcoded page cache, counted as empty");
                0
            })
    }

    /// Opens the book's file and starts reading ahead from where reading goes on, the first time reading the sizes of the pages around there and the rest after it opens.
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
        let file = BookFileAt {
            book: found.id,
            rev: found.rev,
        };
        self.lane.supersede_other_books(file);
        let filled = match self.shared.size_fills.take(file) {
            Some(pending) => pending.sizes.await.ok(),
            None => None,
        };
        let is_filled = filled.is_some();
        let known = match filled {
            Some(sizes) => Some(sizes),
            None => library.page_dimensions(found.file, found.rev).await?,
        };
        let shared = Arc::clone(&self.shared);
        let located = library
            .book_file(found)
            .ok_or(OpenBookError::FolderClosed { id })?;
        let file_type = FileType::of(&located.path);
        let reading = found.reading;
        let (opened, sizes, probed, direction) = self
            .lane
            .run(move || {
                let opened = shared.books.open(file, &located)?;
                let direction = written_direction(&mut opened.lock());
                Ok::<_, FormatError>(match known {
                    Some(sizes) if sizes.len() == opened.page_count => {
                        (opened, sizes, None, direction)
                    }
                    _ => {
                        let window = opening_window(
                            start_index(reading, opened.page_count),
                            PAGES_READ_AHEAD,
                            opened.page_count,
                        );
                        let sizes = probe_window(&mut opened.lock(), &window);
                        (opened, sizes, Some(window), direction)
                    }
                })
            })
            .await?
            .map_err(|source| OpenBookError::unreadable(id, file_type, source))?;
        match probed {
            Some(window) if window.len() < opened.page_count => {
                self.fill_sizes_later(&opened, found.file, sizes.clone(), window);
            }
            Some(_) => store_sizes(library, found.file, found.rev, sizes.clone()).await,
            None if is_filled => store_sizes(library, found.file, found.rev, sizes.clone()).await,
            None => {}
        }
        if let Err(error) = library.start_reading(id, opened.page_count).await {
            tracing::debug!(error = %describe_error(&error), "save the page reached in the book read before this one");
        }
        let damage = BookDamage::of(opened.damage, found.page_count, opened.page_count);
        if damage.is_none()
            && let Err(error) = library.record_page_count(id, opened.page_count).await
        {
            tracing::warn!(error = %describe_error(&error), "keep how many pages the book holds");
        }
        let seconds_per_page = library.seconds_per_page().await.unwrap_or_else(|error| {
            tracing::debug!(error = %describe_error(&error), "learn how long a page takes to read");
            None
        });
        let start = start_page(found.reading, opened.page_count);
        self.read_ahead(
            &opened,
            start_index(found.reading, opened.page_count),
            PageCrop::Whole,
        );
        Ok(OpenedBook {
            damage,
            ..opened_book(to_open, &sizes, start, direction, seconds_per_page)
        })
    }

    fn fill_sizes_later(
        &self,
        opened: &OpenBook,
        file: BookFileId,
        sizes: PageSizes,
        window: Range<usize>,
    ) {
        let (sender, receiver) = oneshot::channel();
        let reading = opened.clone();
        self.lane.read_sizes(Box::new(move || {
            if sender.send(fill_sizes(&reading, sizes, &window)).is_err() {
                tracing::trace!("the router stopped waiting for a book's page sizes");
            }
        }));
        self.shared.size_fills.insert(
            opened.file,
            SizeFill {
                file,
                sizes: receiver,
            },
        );
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
        let Some(PageAt { index, .. }) = opened.page(path.index) else {
            return Ok(None);
        };
        let page = PageAt { path, index };
        let served = if let Some(served) = kept {
            served
        } else {
            let shared = Arc::clone(&self.shared);
            let reading = opened.clone();
            self.lane
                .read_page(page.path, move || shared.serve(&reading, page))
                .await??
        };
        self.read_ahead(&opened, page.index.saturating_add(1), path.crop);
        if let Some((file, sizes)) = self.shared.size_fills.take_finished(opened.file) {
            store_sizes(library, file, path.rev, sizes).await;
        }
        Ok(Some(served))
    }

    fn read_ahead(&self, opened: &OpenBook, first: usize, crop: PageCrop) {
        let memory = self.shared.memory();
        let jobs = (first..opened.page_count)
            .take(PAGES_READ_AHEAD)
            .filter_map(|index| {
                let PageAt { path, index } = opened.page(u32::try_from(index).ok()?)?;
                let page = PageAt {
                    path: path.cropped(crop),
                    index,
                };
                (!memory.contains(&page.path) && !self.shared.in_flight.contains(&page.path))
                    .then_some(page)
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

    /// Reads the page into memory unless another job read it meanwhile, a job asking for a page another is reading waiting for that one's result.
    fn serve(&self, opened: &OpenBook, page: PageAt) -> Result<Arc<ServedPage>, PageError> {
        let PageAt { path, index } = page;
        let _claim = self.in_flight.claim(path);
        if let Some(page) = self.memory().get(&path) {
            return Ok(page);
        }
        let bytes = opened.lock().read_page(index)?;
        let whole = self.prepared(path.cropped(PageCrop::Whole), bytes)?;
        let page = Arc::new(self.cropped_as_asked(opened, path, whole));
        let weight = u64::try_from(page.bytes.len()).unwrap_or(u64::MAX);
        self.memory().insert(path, Arc::clone(&page), weight);
        Ok(page)
    }

    fn cropped_as_asked(&self, opened: &OpenBook, path: PagePath, whole: ServedPage) -> ServedPage {
        match path.crop {
            PageCrop::Whole => whole,
            PageCrop::Borders => self.cropped(path, whole, |page| {
                let _decoding = self.decodes.hold();
                crop_white_borders(page, CroppedSides::All)
            }),
            PageCrop::SideBorders => self.cropped(path, whole, |page| {
                let Some(book) = book_side_borders(opened, &self.decodes, self.transcodes()) else {
                    return Ok(None);
                };
                let _decoding = self.decodes.hold();
                crop_side_borders(page, book)
            }),
        }
    }

    fn prepared(&self, path: PagePath, bytes: Vec<u8>) -> Result<ServedPage, PageError> {
        let format = PageFormat::sniff(&bytes).ok_or(PageError::NotAnImage)?;
        let is_oversized = page_size(&bytes).is_ok_and(|size| size.pixels() > PAGE_PIXEL_BUDGET);
        if !is_oversized && !self.needs_transcoding(format) {
            return Ok(ServedPage {
                content_type: format.content_type(),
                bytes,
            });
        }
        let key = path.cache_key()?;
        let cache = self.transcodes();
        if let Some(cached) = cache.and_then(|cache| cache.get(&key))
            && let Some(format) = PageFormat::sniff(&cached)
        {
            return Ok(ServedPage {
                content_type: format.content_type(),
                bytes: cached,
            });
        }
        let transcoded = {
            let _decoding = self.decodes.hold();
            if is_oversized {
                shrink_page(&bytes, PAGE_PIXEL_BUDGET)?
            } else {
                transcode(&bytes)?
            }
        };
        if let Some(Err(error)) = cache.map(|cache| cache.put(&key, &transcoded.bytes)) {
            tracing::warn!(%path, error = %describe_error(&error), "keep a transcoded page for next time");
        }
        Ok(ServedPage {
            content_type: transcoded.format.content_type(),
            bytes: transcoded.bytes,
        })
    }

    fn cropped(
        &self,
        path: PagePath,
        whole: ServedPage,
        crop: impl FnOnce(&[u8]) -> Result<Option<Transcoded>, ImagingError>,
    ) -> ServedPage {
        let key = match path.cache_key() {
            Ok(key) => key,
            Err(error) => {
                tracing::warn!(%path, error = %describe_error(&error), "name a cropped page in the cache, so it's served whole");
                return whole;
            }
        };
        let cache = self.transcodes();
        if let Some(kept) = cache.and_then(|cache| cache.get(&key))
            && let Some(format) = PageFormat::sniff(&kept)
        {
            return ServedPage {
                content_type: format.content_type(),
                bytes: kept,
            };
        }
        match crop(&whole.bytes) {
            Ok(Some(cropped)) => {
                if let Some(Err(error)) = cache.map(|cache| cache.put(&key, &cropped.bytes)) {
                    tracing::warn!(%path, error = %describe_error(&error), "keep a cropped page for next time");
                }
                ServedPage {
                    content_type: cropped.format.content_type(),
                    bytes: cropped.bytes,
                }
            }
            Ok(None) => whole,
            Err(ImagingError::Unsupported) => {
                tracing::debug!(%path, "serve whole a page in a format whose borders can't be found");
                whole
            }
            Err(error) => {
                tracing::warn!(%path, error = %describe_error(&error), "crop a page's white borders, so it's served whole");
                whole
            }
        }
    }

    fn needs_transcoding(&self, format: PageFormat) -> bool {
        let undecodable = self
            .undecodable
            .read()
            .unwrap_or_else(PoisonError::into_inner);
        ProbedFormat::of(format).is_some_and(|probed| undecodable.contains(&probed))
    }

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

/// The pages a job is reading, so a second job for one waits for the first rather than reading and transcoding it again.
#[derive(Default)]
struct PagesInFlight {
    reading: Mutex<HashSet<PagePath>>,
    finished: Condvar,
}

struct PageClaim<'pages> {
    pages: &'pages PagesInFlight,
    path: PagePath,
}

impl PagesInFlight {
    fn claim(&self, path: PagePath) -> PageClaim<'_> {
        let mut reading = self.reading();
        while reading.contains(&path) {
            reading = self
                .finished
                .wait(reading)
                .unwrap_or_else(PoisonError::into_inner);
        }
        reading.insert(path);
        PageClaim { pages: self, path }
    }

    fn contains(&self, path: &PagePath) -> bool {
        self.reading().contains(path)
    }

    fn reading(&self) -> MutexGuard<'_, HashSet<PagePath>> {
        self.reading.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

impl Drop for PageClaim<'_> {
    fn drop(&mut self) {
        self.pages.reading().remove(&self.path);
        self.pages.finished.notify_all();
    }
}

/// The page reading goes on from, counting from 0, or the first page of a book not started or read to its end.
fn start_page(reading: StoredReading, page_count: usize) -> u32 {
    let last = u32::try_from(page_count.saturating_sub(1)).unwrap_or(u32::MAX);
    match reading {
        StoredReading::Started {
            position_page: Some(page),
        } => page.min(last),
        StoredReading::Read {
            position_page: Some(page),
        } if page < last => page,
        StoredReading::Started {
            position_page: None,
        }
        | StoredReading::Read { .. }
        | StoredReading::NotStarted => 0,
    }
}

fn start_index(reading: StoredReading, page_count: usize) -> usize {
    usize::try_from(start_page(reading, page_count)).unwrap_or(usize::MAX)
}

async fn store_sizes(library: &Library, file: BookFileId, rev: u32, sizes: PageSizes) {
    if let Err(error) = library.store_page_dimensions(file, rev, sizes).await {
        tracing::warn!(error = %describe_error(&error), "keep the size of each page for the next time the book opens");
    }
}

fn opened_book(
    BookToOpen { found, place }: BookToOpen,
    sizes: &[Option<omnileaf_db::catalog::PageDimensions>],
    start_page: u32,
    reading_direction: Option<ReadingDirection>,
    seconds_per_page: Option<u32>,
) -> OpenedBook {
    let pages = (0_u32..)
        .zip(sizes)
        .map(|(index, size)| {
            let path = PagePath {
                book: found.id,
                rev: found.rev,
                index,
                crop: PageCrop::Whole,
            };
            BookPage {
                path,
                thumbnail: PageThumbnailPath(path),
                size: size.map(Into::into),
            }
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
        reading_direction,
        bookmarked_pages: None,
        damage: None,
        seconds_per_page,
    }
}

/// The direction the book's `ComicInfo` gives, none when it can't be read.
fn written_direction(book: &mut Book) -> Option<ReadingDirection> {
    let comic_info = book.comic_info().unwrap_or_else(|error| {
        tracing::debug!(
            error = %describe_error(&error),
            "leave the reading direction to the reader for a book whose ComicInfo can't be read"
        );
        None
    });
    comic_info?.reading_direction.map(Into::into)
}

#[cfg(test)]
mod tests {
    use std::{sync::Barrier, thread};

    use omnileaf_formats::LocalStorage;
    use omnileaf_sync_proto::{Fingerprint, ImageEntry};
    use omnileaf_testkit::{ArchiveEntry, Compression, PageShape, ScratchFolder, cbz, page_webp};

    use super::*;
    use crate::file_in_storage::FileInStorage;

    const PAGE_COUNT: usize = 30;
    const RACED_PAGES: u32 = 12;

    fn webp_book(folder: &ScratchFolder) -> FileInStorage {
        let entries: Vec<ArchiveEntry> = (0..RACED_PAGES)
            .map(|index| ArchiveEntry {
                name: format!("{index:03}.webp"),
                bytes: page_webp(7, index, PageShape::Spread).unwrap(),
            })
            .collect();
        FileInStorage {
            storage: Arc::new(LocalStorage),
            path: folder.write("book.cbz", &cbz(&entries, Compression::Stored).unwrap()),
        }
    }

    #[test]
    fn hands_a_page_two_jobs_ask_for_at_once_to_both_from_a_single_transcode() {
        let folder = ScratchFolder::new("pages-in-flight");
        let stored = webp_book(&folder);
        let pages = Pages::open(
            folder.path().join("transcodes"),
            Arc::new(DecodePermits::new(1)),
        )
        .unwrap();
        *pages.shared.undecodable.write().unwrap() = HashSet::from([ProbedFormat::Webp]);
        let file = BookFileAt {
            book: omnileaf_sync_proto::BookId::local(
                &Fingerprint::pmf1([ImageEntry { crc32: 7, size: 1 }]).unwrap(),
            ),
            rev: 1,
        };
        let opened = pages.shared.books.open(file, &stored).unwrap();

        let shared_both = (0..RACED_PAGES).all(|index| {
            let page = opened.page(index).unwrap();
            let start = Barrier::new(2);
            let [first, second] = thread::scope(|scope| {
                [(); 2]
                    .map(|()| {
                        scope.spawn(|| {
                            start.wait();
                            pages.shared.serve(&opened, page).unwrap()
                        })
                    })
                    .map(|job| job.join().unwrap())
            });
            Arc::ptr_eq(&first, &second)
        });

        assert!(shared_both);
    }

    fn started_at(position_page: Option<u32>) -> StoredReading {
        StoredReading::Started { position_page }
    }

    fn read_at(position_page: Option<u32>) -> StoredReading {
        StoredReading::Read { position_page }
    }

    #[test]
    fn opens_a_book_read_before_on_the_page_reading_it_again_reached() {
        let start = start_page(read_at(Some(13)), PAGE_COUNT);

        assert_eq!(start, 13);
    }

    #[test]
    fn opens_on_the_first_page_a_book_read_to_its_last_page() {
        let starts =
            [read_at(Some(29)), read_at(Some(40))].map(|reading| start_page(reading, PAGE_COUNT));

        assert_eq!(starts, [0, 0]);
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
        let starts = [StoredReading::NotStarted, started_at(None), read_at(None)]
            .map(|reading| start_page(reading, PAGE_COUNT));

        assert_eq!(starts, [0, 0, 0]);
    }

    #[test]
    fn opens_a_book_with_no_pages_on_its_first_page() {
        let start = start_page(started_at(Some(3)), 0);

        assert_eq!(start, 0);
    }
}
