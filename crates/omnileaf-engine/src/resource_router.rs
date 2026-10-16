use std::{io, path::Path, sync::Arc};

use crate::{
    BookId, CacheSizes, CoverPath, Library, OpenedBook, PagePath, PageThumbnailPath, ProbedFormat,
    Resource,
    cover_path::THUMBNAIL_VERSION,
    cover_thumbnails::{CoverThumbnails, ThumbnailError},
    decode_permits::{DECODES_AT_ONCE, DecodePermits},
    describe_error,
    pages::{OpenBookError, PAGE_CACHE_VERSION, Pages},
};

const THUMBNAIL_FOLDER: &str = "thumbs";
const PAGE_FOLDER: &str = "pages";
const JPEG: &str = "image/jpeg";

pub struct ResourceRouter {
    thumbnails: CoverThumbnails,
    pages: Pages,
}

#[derive(Debug, thiserror::Error)]
pub enum ResourceRouterError {
    #[error("start the cover thumbnail workers")]
    Workers(#[source] io::Error),
    #[error("start the page workers")]
    PageWorkers(#[source] io::Error),
}

impl ResourceRouter {
    /// The platform may empty `cache_folder` whenever it needs the space.
    #[tracing::instrument(skip_all, fields(cache_folder = %cache_folder.display()))]
    pub fn open(cache_folder: &Path) -> Result<Self, ResourceRouterError> {
        let decodes = Arc::new(DecodePermits::new(DECODES_AT_ONCE));
        let folder = cache_folder.join(THUMBNAIL_FOLDER).join(THUMBNAIL_VERSION);
        let thumbnails = CoverThumbnails::open(folder, Arc::clone(&decodes))
            .map_err(ResourceRouterError::Workers)?;
        let pages = Pages::open(
            cache_folder.join(PAGE_FOLDER).join(PAGE_CACHE_VERSION),
            decodes,
        )
        .map_err(ResourceRouterError::PageWorkers)?;
        Ok(Self { thumbnails, pages })
    }

    pub async fn cache_sizes(&self) -> CacheSizes {
        let (cached_pages_bytes, covers_bytes) =
            tokio::join!(self.pages.cached_bytes(), self.thumbnails.cached_bytes());
        CacheSizes {
            cached_pages_bytes,
            covers_bytes,
        }
    }

    pub async fn clear_cached_pages(&self) -> u64 {
        self.pages.clear_cached().await
    }

    pub async fn clear_covers(&self) -> u64 {
        self.thumbnails.clear_cached().await
    }

    pub async fn make_room(&self, bytes: u64) -> u64 {
        let from_pages = self.pages.trim_cached(bytes).await;
        let still_wanted = bytes.saturating_sub(from_pages);
        if still_wanted == 0 {
            return from_pages;
        }
        from_pages.saturating_add(self.thumbnails.trim_cached(still_wanted).await)
    }

    #[tracing::instrument(skip_all, fields(%book))]
    pub async fn open_book(
        &self,
        library: &Library,
        book: BookId,
        undecodable: Vec<ProbedFormat>,
    ) -> Result<OpenedBook, OpenBookError> {
        self.pages.open_book(library, book, undecodable).await
    }

    #[tracing::instrument(skip_all, fields(%path))]
    pub async fn respond(&self, library: &Library, path: &str) -> Resource {
        let Some(route) = path.strip_prefix('/') else {
            return Resource::NotFound;
        };
        if let Ok(page) = route.parse::<PagePath>() {
            return self.page(library, page).await;
        }
        if let Ok(PageThumbnailPath(page)) = route.parse() {
            return thumbnail_resource(self.thumbnails.page_thumbnail(library, page).await);
        }
        let Ok(cover) = route.parse::<CoverPath>() else {
            return Resource::NotFound;
        };
        thumbnail_resource(self.thumbnails.thumbnail(library, cover.0).await)
    }

    async fn page(&self, library: &Library, page: PagePath) -> Resource {
        match self.pages.page(library, page).await {
            Ok(Some(served)) => Resource::Immutable {
                content_type: served.content_type,
                body: served.bytes.clone(),
            },
            Ok(None) => Resource::NotFound,
            Err(error) if error.is_superseded() => {
                tracing::debug!(%page, "drop a page the reader moved on from");
                Resource::NotFound
            }
            Err(error) => {
                tracing::warn!(error = %describe_error(&error), "serve a page");
                Resource::Failed
            }
        }
    }
}

fn thumbnail_resource(made: Result<Option<Vec<u8>>, ThumbnailError>) -> Resource {
    match made {
        Ok(Some(body)) => Resource::Immutable {
            content_type: JPEG,
            body,
        },
        Ok(None) => Resource::NotFound,
        Err(error) => {
            tracing::warn!(error = %describe_error(&error), "serve a thumbnail");
            Resource::Failed
        }
    }
}

#[cfg(test)]
mod tests {
    use std::fs;

    use omnileaf_testkit::ScratchFolder;

    use super::*;

    const ENTRY: [u8; 100] = [7; 100];

    fn cached(folder: &Path, names: &[&str]) {
        fs::create_dir_all(folder).unwrap();
        for name in names {
            fs::write(folder.join(name), ENTRY).unwrap();
        }
    }

    fn router_with(pages: &[&str], covers: &[&str]) -> (ScratchFolder, ResourceRouter) {
        let folder = ScratchFolder::new("resource-router-caches");
        cached(
            &folder.path().join(PAGE_FOLDER).join(PAGE_CACHE_VERSION),
            pages,
        );
        cached(
            &folder.path().join(THUMBNAIL_FOLDER).join(THUMBNAIL_VERSION),
            covers,
        );
        let router = ResourceRouter::open(folder.path()).unwrap();
        (folder, router)
    }

    #[tokio::test]
    async fn sizes_the_cached_pages_and_the_covers_apart() {
        let (_folder, router) = router_with(&["page-a", "page-b"], &["cover-a"]);

        let sizes = router.cache_sizes().await;

        assert_eq!(
            sizes,
            CacheSizes {
                cached_pages_bytes: 200,
                covers_bytes: 100,
            }
        );
    }

    #[tokio::test]
    async fn clears_the_cached_pages_and_leaves_the_covers() {
        let (_folder, router) = router_with(&["page-a", "page-b"], &["cover-a"]);

        let freed = router.clear_cached_pages().await;

        assert_eq!(freed, 200);
        assert_eq!(
            router.cache_sizes().await,
            CacheSizes {
                cached_pages_bytes: 0,
                covers_bytes: 100,
            }
        );
    }

    #[tokio::test]
    async fn clears_the_covers_and_leaves_the_cached_pages() {
        let (_folder, router) = router_with(&["page-a"], &["cover-a", "cover-b"]);

        let freed = router.clear_covers().await;

        assert_eq!(freed, 200);
        assert_eq!(router.cache_sizes().await.cached_pages_bytes, 100);
    }

    #[tokio::test]
    async fn makes_room_from_the_cached_pages_before_the_covers() {
        let (_folder, router) = router_with(&["page-a", "page-b"], &["cover-a", "cover-b"]);

        let freed = router.make_room(250).await;

        assert_eq!(freed, 300);
        assert_eq!(
            router.cache_sizes().await,
            CacheSizes {
                cached_pages_bytes: 0,
                covers_bytes: 100,
            }
        );
    }

    #[tokio::test]
    async fn leaves_the_covers_alone_when_the_cached_pages_make_room_enough() {
        let (_folder, router) = router_with(&["page-a", "page-b"], &["cover-a"]);

        let freed = router.make_room(100).await;

        assert_eq!(freed, 100);
        assert_eq!(
            router.cache_sizes().await,
            CacheSizes {
                cached_pages_bytes: 100,
                covers_bytes: 100,
            }
        );
    }
}
