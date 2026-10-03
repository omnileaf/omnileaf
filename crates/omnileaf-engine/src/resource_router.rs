use std::path::PathBuf;

use tokio::task::spawn_blocking;

use omnileaf_cache::CacheError;

use crate::{
    CoverPath, Library, Resource, cover_path::THUMBNAIL_VERSION, cover_thumbnails::CoverThumbnails,
};

const THUMBNAIL_FOLDER: &str = "thumbs";
const JPEG: &str = "image/jpeg";

/// Answers the `omni` protocol's requests for cover thumbnails, by ids in the path and never by a path on disk.
pub struct ResourceRouter {
    thumbnails: CoverThumbnails,
}

#[derive(Debug, thiserror::Error)]
pub enum ResourceRouterError {
    #[error("open the cover thumbnail cache")]
    Cache(#[from] CacheError),
    #[error("start the cover thumbnail workers")]
    Workers(#[source] std::io::Error),
    #[error("run blocking work to open the cover thumbnails")]
    Interrupted(#[from] tokio::task::JoinError),
}

impl ResourceRouter {
    /// Keeps thumbnails under `cache_folder`, which the platform may empty whenever it needs the space.
    #[tracing::instrument(skip_all, fields(cache_folder = %cache_folder.display()))]
    pub async fn open(cache_folder: PathBuf) -> Result<Self, ResourceRouterError> {
        let folder = cache_folder.join(THUMBNAIL_FOLDER).join(THUMBNAIL_VERSION);
        let thumbnails = spawn_blocking(move || CoverThumbnails::open(folder)).await??;
        Ok(Self { thumbnails })
    }

    /// Answers a request for `path`, the request URL's path, such as `/thumb/v1/…`.
    #[tracing::instrument(skip_all, fields(%path))]
    pub async fn respond(&self, library: &Library, path: &str) -> Resource {
        let Some(cover) = path
            .strip_prefix('/')
            .and_then(|route| route.parse::<CoverPath>().ok())
        else {
            return Resource::NotFound;
        };
        match self.thumbnails.thumbnail(library, cover.0).await {
            Ok(Some(body)) => Resource::Immutable {
                content_type: JPEG,
                body,
            },
            Ok(None) => Resource::NotFound,
            Err(error) => {
                tracing::warn!(error = %describe(&error), "serve a cover thumbnail");
                Resource::Failed
            }
        }
    }
}

fn describe(error: &dyn std::error::Error) -> String {
    let mut description = error.to_string();
    let mut cause = error.source();
    while let Some(source) = cause {
        description.push_str(": ");
        description.push_str(&source.to_string());
        cause = source.source();
    }
    description
}
