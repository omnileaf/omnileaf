use std::{io, path::Path};

use crate::{
    BookId, CoverPath, Library, OpenedBook, PagePath, ProbedFormat, Resource,
    cover_path::THUMBNAIL_VERSION,
    cover_thumbnails::CoverThumbnails,
    describe_error,
    pages::{OpenBookError, PAGE_CACHE_VERSION, Pages},
};

const THUMBNAIL_FOLDER: &str = "thumbs";
const PAGE_FOLDER: &str = "pages";
const JPEG: &str = "image/jpeg";
const PAGE_ROUTE: &str = "page/";

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
        let folder = cache_folder.join(THUMBNAIL_FOLDER).join(THUMBNAIL_VERSION);
        let thumbnails = CoverThumbnails::open(folder).map_err(ResourceRouterError::Workers)?;
        let pages = Pages::open(cache_folder.join(PAGE_FOLDER).join(PAGE_CACHE_VERSION))
            .map_err(ResourceRouterError::PageWorkers)?;
        Ok(Self { thumbnails, pages })
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
        if route.starts_with(PAGE_ROUTE) {
            return match route.parse::<PagePath>() {
                Ok(page) => self.page(library, page).await,
                Err(_) => Resource::NotFound,
            };
        }
        let Ok(cover) = route.parse::<CoverPath>() else {
            return Resource::NotFound;
        };
        match self.thumbnails.thumbnail(library, cover.0).await {
            Ok(Some(body)) => Resource::Immutable {
                content_type: JPEG,
                body,
            },
            Ok(None) => Resource::NotFound,
            Err(error) => {
                tracing::warn!(error = %describe_error(&error), "serve a cover thumbnail");
                Resource::Failed
            }
        }
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
