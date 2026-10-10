use std::{
    collections::HashSet,
    io,
    num::NonZeroUsize,
    path::PathBuf,
    sync::{Arc, Mutex, MutexGuard, PoisonError},
};

use omnileaf_cache::{CacheError, CacheKey, DiskCache};
use omnileaf_db::catalog::Cover;
use omnileaf_formats::{FormatError, Limits, Storage, open_book_in};
use omnileaf_imaging::{ImagingError, is_whole_jpeg, thumbnail};
use tokio::{sync::OnceCell, task::spawn_blocking};

use crate::{
    Library, LibraryError,
    background_lane::{BackgroundLane, LaneStopped},
    describe_error,
    device_class::{IS_MOBILE, MEBIBYTE},
};

const CACHE_BUDGET_BYTES: u64 = (if IS_MOBILE { 300 } else { 1024 }) * MEBIBYTE as u64;
/// One worker on a phone, since each decode may hold a few hundred megabytes at once.
const WORKERS: NonZeroUsize = if IS_MOBILE {
    NonZeroUsize::MIN
} else {
    NonZeroUsize::MIN.saturating_add(1)
};
const WORKER_NAME: &str = "omnileaf-thumbnails";

pub(crate) struct CoverFile {
    pub(crate) storage: Arc<dyn Storage>,
    pub(crate) path: PathBuf,
}

/// Cover thumbnails, kept on disk under a byte budget and made on a background lane when missing.
pub(crate) struct CoverThumbnails {
    folder: PathBuf,
    cache: OnceCell<Option<Arc<DiskCache>>>,
    lane: BackgroundLane,
    /// Covers whose page couldn't be made into a thumbnail, which fail again without another decode until their file changes.
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
    #[error("make a thumbnail of a cover whose page couldn't be made into one before")]
    FailedBefore,
}

impl CoverThumbnails {
    /// Leaves the cache folder alone until the first cover is asked for, so opening never waits on its files.
    pub(crate) fn open(folder: PathBuf) -> io::Result<Self> {
        Ok(Self {
            folder,
            cache: OnceCell::new(),
            lane: BackgroundLane::start(WORKER_NAME, WORKERS)?,
            failed_covers: Mutex::default(),
        })
    }

    /// The cover's thumbnail as a JPEG, or nothing once its file has changed or gone since the cover was listed.
    pub(crate) async fn thumbnail(
        &self,
        library: &Library,
        cover: Cover,
    ) -> Result<Option<Vec<u8>>, ThumbnailError> {
        let key = cache_key(cover)?;
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
        let Some(file) = library.cover_file(cover).await? else {
            return Ok(None);
        };
        let made_key = key.clone();
        let made = self
            .lane
            .run(move || make_thumbnail(cache.as_deref(), &made_key, &file))
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

    /// The cache, opened by whichever request comes first, or nothing when it can't be opened.
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

fn cache_key(cover: Cover) -> Result<CacheKey, CacheError> {
    format!("{}-{}-{}", cover.book, cover.file, cover.rev).parse()
}

/// The thumbnail the cache holds, letting go of one a lost write cut short so it is made again.
fn cached_thumbnail(cache: &DiskCache, key: &CacheKey) -> Option<Vec<u8>> {
    let cached = cache.get(key)?;
    if is_whole_jpeg(&cached) {
        return Some(cached);
    }
    tracing::warn!(%key, "make a cover thumbnail again that a lost write cut short");
    cache.remove(key);
    None
}

/// Reads the page the book shows as its cover and stores its thumbnail, unless another request stored it meanwhile.
fn make_thumbnail(
    cache: Option<&DiskCache>,
    key: &CacheKey,
    file: &CoverFile,
) -> Result<Vec<u8>, ThumbnailError> {
    if let Some(cached) = cache.and_then(|cache| cached_thumbnail(cache, key)) {
        return Ok(cached);
    }
    let mut book = open_book_in(Arc::clone(&file.storage), &file.path, &Limits::default())?;
    let comic_info = book.comic_info().unwrap_or_else(|error| {
        tracing::warn!(
            file = %file.path.display(),
            error = %describe_error(&error),
            "show the first page of a book whose ComicInfo can't be read"
        );
        None
    });
    let page = book.read_page(book.cover_page(comic_info.as_ref()))?;
    let made = thumbnail(&page)?.jpeg;
    if let Some(Err(error)) = cache.map(|cache| cache.put(key, &made)) {
        tracing::warn!(
            file = %file.path.display(),
            error = %describe_error(&error),
            "keep a cover thumbnail for next time"
        );
    }
    Ok(made)
}
