use std::{
    num::NonZeroUsize,
    path::{Path, PathBuf},
    sync::Arc,
};

use omnileaf_cache::{CacheError, CacheKey, DiskCache};
use omnileaf_db::catalog::Cover;
use omnileaf_formats::{FormatError, open_book};
use omnileaf_imaging::{ImagingError, thumbnail};
use tokio::task::spawn_blocking;

use crate::{
    Library, LibraryError, ResourceRouterError,
    background_lane::{BackgroundLane, LaneStopped},
};

const MEBIBYTE: u64 = 1 << 20;
const CACHE_BUDGET_BYTES: u64 = if cfg!(any(target_os = "android", target_os = "ios")) {
    300 * MEBIBYTE
} else {
    1024 * MEBIBYTE
};
const WORKERS: NonZeroUsize = NonZeroUsize::MIN.saturating_add(1);
const WORKER_NAME: &str = "omnileaf-thumbnails";

/// Cover thumbnails, kept on disk under a byte budget and made on a background lane when missing.
pub(crate) struct CoverThumbnails {
    cache: Arc<DiskCache>,
    lane: BackgroundLane,
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
}

impl CoverThumbnails {
    /// Blocks while it lists the cache folder.
    pub(crate) fn open(folder: PathBuf) -> Result<Self, ResourceRouterError> {
        Ok(Self {
            cache: Arc::new(DiskCache::open(folder, CACHE_BUDGET_BYTES)?),
            lane: BackgroundLane::start(WORKER_NAME, WORKERS)
                .map_err(ResourceRouterError::Workers)?,
        })
    }

    /// The cover's thumbnail as a JPEG, or nothing once its file has changed or gone since the cover was listed.
    pub(crate) async fn thumbnail(
        &self,
        library: &Library,
        cover: Cover,
    ) -> Result<Option<Vec<u8>>, ThumbnailError> {
        let key = cache_key(cover)?;
        let cache = Arc::clone(&self.cache);
        let cached_key = key.clone();
        if let Some(cached) = spawn_blocking(move || cache.get(&cached_key)).await?? {
            return Ok(Some(cached));
        }
        let Some(file) = library.cover_file(cover).await? else {
            return Ok(None);
        };
        let cache = Arc::clone(&self.cache);
        let made = self
            .lane
            .run(move || make_thumbnail(&cache, &key, &file))
            .await??;
        Ok(Some(made))
    }
}

fn cache_key(cover: Cover) -> Result<CacheKey, CacheError> {
    format!("{}-{}-{}", cover.book, cover.file, cover.rev).parse()
}

/// Reads the page the book shows as its cover and stores its thumbnail, unless another request stored it meanwhile.
fn make_thumbnail(
    cache: &DiskCache,
    key: &CacheKey,
    file: &Path,
) -> Result<Vec<u8>, ThumbnailError> {
    if let Some(cached) = cache.get(key)? {
        return Ok(cached);
    }
    let mut book = open_book(file)?;
    let comic_info = book.comic_info().unwrap_or_else(|error| {
        tracing::warn!(%error, "show the first page of a book whose ComicInfo can't be read");
        None
    });
    let page = book.read_page(book.cover_page(comic_info.as_ref()))?;
    let made = thumbnail(&page)?.jpeg;
    if let Err(error) = cache.put(key, &made) {
        tracing::warn!(%error, "keep a cover thumbnail for next time");
    }
    Ok(made)
}
