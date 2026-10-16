use std::{
    collections::HashSet,
    future::Future,
    io,
    num::NonZeroUsize,
    path::{Path, PathBuf},
    sync::{Arc, Mutex, MutexGuard, PoisonError},
};

use omnileaf_cache::{CacheError, CacheKey, DiskCache};
use omnileaf_db::catalog::Cover;
use omnileaf_formats::{Book, FormatError, Limits, open_book_in};
use omnileaf_imaging::{ImagingError, THUMBNAIL_WIDTH, is_whole_jpeg, thumbnail};
use tokio::{sync::OnceCell, task::spawn_blocking};

use crate::{
    BookId, Library, LibraryError, PagePath,
    background_lane::BackgroundLane,
    decode_permits::DecodePermits,
    describe_error,
    device_class::{IS_MOBILE, MEBIBYTE},
    file_in_storage::FileInStorage,
    lane::LaneStopped,
};

const CACHE_BUDGET_BYTES: u64 = (if IS_MOBILE { 300 } else { 1024 }) * MEBIBYTE as u64;
/// One worker on a phone, whose OS ends an app holding too much memory while each decode may hold a few hundred megabytes.
pub(crate) const WORKERS: NonZeroUsize = if IS_MOBILE {
    NonZeroUsize::MIN
} else {
    NonZeroUsize::MIN.saturating_add(1)
};
const WORKER_NAME: &str = "omnileaf-thumbnails";
/// Enough for the slider's filmstrip, which draws a page about 50 points wide, on a screen of three pixels to the point.
const PAGE_THUMBNAIL_WIDTH: u32 = 160;

pub(crate) struct CoverThumbnails {
    folder: PathBuf,
    cache: OnceCell<Option<Arc<DiskCache>>>,
    lane: BackgroundLane,
    decodes: Arc<DecodePermits>,
    failed_covers: Mutex<HashSet<CacheKey>>,
}

#[derive(Debug, thiserror::Error)]
pub(crate) enum ThumbnailError {
    #[error("find the cover's file")]
    Library(#[from] LibraryError),
    #[error("read the cover's book")]
    Format(#[from] FormatError),
    #[error("make a thumbnail of the cover")]
    Imaging(#[from] ImagingError),
    #[error("reach the thumbnail cache")]
    Cache(#[from] CacheError),
    #[error("make a thumbnail on the background lane")]
    Lane(#[from] LaneStopped),
    #[error("run blocking thumbnail work")]
    Interrupted(#[from] tokio::task::JoinError),
    #[error("make a thumbnail of a page that couldn't be made into one before")]
    FailedBefore,
}

#[derive(Clone, Copy)]
enum Pictured {
    Cover,
    Page(u32),
}

impl Pictured {
    const fn width(self) -> u32 {
        match self {
            Self::Cover => THUMBNAIL_WIDTH,
            Self::Page(_) => PAGE_THUMBNAIL_WIDTH,
        }
    }
}

impl CoverThumbnails {
    pub(crate) fn open(folder: PathBuf, decodes: Arc<DecodePermits>) -> io::Result<Self> {
        Ok(Self {
            folder,
            cache: OnceCell::new(),
            lane: BackgroundLane::start(WORKER_NAME, WORKERS)?,
            decodes,
            failed_covers: Mutex::default(),
        })
    }

    pub(crate) async fn thumbnail(
        &self,
        library: &Library,
        cover: Cover,
    ) -> Result<Option<Vec<u8>>, ThumbnailError> {
        let found = async move {
            let file = library.cover_file(cover).await?;
            Ok(file.map(|file| (file, Pictured::Cover)))
        };
        self.thumbnail_of(cache_key(cover)?, found).await
    }

    /// The page's thumbnail as a JPEG, or nothing once its book's file has changed or gone since the page was listed.
    pub(crate) async fn page_thumbnail(
        &self,
        library: &Library,
        page: PagePath,
    ) -> Result<Option<Vec<u8>>, ThumbnailError> {
        let key = format!("page-{}-{}-{}", page.book, page.rev, page.index).parse()?;
        let found = async move {
            let book = library.book_to_read(BookId(page.book)).await?;
            Ok(book
                .filter(|book| book.rev == page.rev)
                .and_then(|book| library.book_file(&book))
                .map(|file| (file, Pictured::Page(page.index))))
        };
        self.thumbnail_of(key, found).await
    }

    async fn thumbnail_of(
        &self,
        key: CacheKey,
        found: impl Future<Output = Result<Option<(FileInStorage, Pictured)>, LibraryError>>,
    ) -> Result<Option<Vec<u8>>, ThumbnailError> {
        if self.failed_covers().contains(&key) {
            return Err(ThumbnailError::FailedBefore);
        }
        let cache = self.cache().await;
        if let Some(cache) = cache.clone() {
            let cached_key = key.clone();
            if let Some(cached) =
                spawn_blocking(move || cached_thumbnail(&cache, &cached_key)).await?
            {
                return Ok(Some(cached));
            }
        }
        let Some((file, pictured)) = found.await? else {
            return Ok(None);
        };
        let made_key = key.clone();
        let decodes = Arc::clone(&self.decodes);
        let made = self
            .lane
            .run(move || make_thumbnail(cache.as_deref(), &made_key, (&file, pictured), &decodes))
            .await?;
        if let Err(ThumbnailError::Imaging(_)) = made {
            self.failed_covers().insert(key);
        }
        Ok(Some(made?))
    }

    fn failed_covers(&self) -> MutexGuard<'_, HashSet<CacheKey>> {
        self.failed_covers
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
    }

    pub(crate) async fn cached_bytes(&self) -> u64 {
        self.with_cache(DiskCache::stored_bytes).await
    }

    pub(crate) async fn clear_cached(&self) -> u64 {
        self.with_cache(DiskCache::clear).await
    }

    pub(crate) async fn trim_cached(&self, bytes: u64) -> u64 {
        self.with_cache(move |cache| cache.trim_oldest(bytes)).await
    }

    async fn with_cache(&self, work: impl FnOnce(&DiskCache) -> u64 + Send + 'static) -> u64 {
        let Some(cache) = self.cache().await else {
            return 0;
        };
        spawn_blocking(move || work(&cache))
            .await
            .unwrap_or_else(|error| {
                tracing::warn!(%error, "reach the cover cache, counted as empty");
                0
            })
    }

    async fn cache(&self) -> Option<Arc<DiskCache>> {
        self.cache
            .get_or_init(|| open_cache(self.folder.clone()))
            .await
            .clone()
    }
}

async fn open_cache(folder: PathBuf) -> Option<Arc<DiskCache>> {
    match spawn_blocking(move || DiskCache::open(folder, CACHE_BUDGET_BYTES)).await {
        Ok(Ok(cache)) => Some(Arc::new(cache)),
        Ok(Err(error)) => {
            tracing::warn!(error = %describe_error(&error), "open the cover cache, so covers are made afresh each time");
            None
        }
        Err(error) => {
            tracing::warn!(%error, "open the cover cache, so covers are made afresh each time");
            None
        }
    }
}

/// The page the book shows as its cover, the first when its `ComicInfo` can't be read.
fn cover_page(book: &mut Book, file: &Path) -> usize {
    let comic_info = book.comic_info().unwrap_or_else(|error| {
        tracing::warn!(
            file = %file.display(),
            error = %describe_error(&error),
            "show the first page of a book whose ComicInfo can't be read"
        );
        None
    });
    book.cover_page(comic_info.as_ref())
}

fn cache_key(cover: Cover) -> Result<CacheKey, CacheError> {
    format!("{}-{}-{}", cover.book, cover.file, cover.rev).parse()
}

fn cached_thumbnail(cache: &DiskCache, key: &CacheKey) -> Option<Vec<u8>> {
    let cached = cache.get(key)?;
    if is_whole_jpeg(&cached) {
        return Some(cached);
    }
    tracing::warn!(%key, "make a cover thumbnail again that a lost write cut short");
    cache.remove(key);
    None
}

fn make_thumbnail(
    cache: Option<&DiskCache>,
    key: &CacheKey,
    (file, pictured): (&FileInStorage, Pictured),
    decodes: &DecodePermits,
) -> Result<Vec<u8>, ThumbnailError> {
    if let Some(cached) = cache.and_then(|cache| cached_thumbnail(cache, key)) {
        return Ok(cached);
    }
    let mut book = open_book_in(Arc::clone(&file.storage), &file.path, &Limits::default())?;
    let index = match pictured {
        Pictured::Cover => cover_page(&mut book, &file.path),
        Pictured::Page(index) => usize::try_from(index).unwrap_or(usize::MAX),
    };
    let page = book.read_page(index)?;
    let made = {
        let _decoding = decodes.hold();
        thumbnail(&page, pictured.width())?.jpeg
    };
    if let Some(Err(error)) = cache.map(|cache| cache.put(key, &made)) {
        tracing::warn!(
            file = %file.path.display(),
            error = %describe_error(&error),
            "keep a cover thumbnail for next time"
        );
    }
    Ok(made)
}
