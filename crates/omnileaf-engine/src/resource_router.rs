use std::{io, path::Path};

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
    #[error("start the cover thumbnail workers")]
    Workers(#[source] io::Error),
}

impl ResourceRouter {
    /// Keeps thumbnails under `cache_folder`, which the platform may empty whenever it needs the space.
    #[tracing::instrument(skip_all, fields(cache_folder = %cache_folder.display()))]
    pub fn open(cache_folder: &Path) -> Result<Self, ResourceRouterError> {
        let folder = cache_folder.join(THUMBNAIL_FOLDER).join(THUMBNAIL_VERSION);
        let thumbnails = CoverThumbnails::open(folder).map_err(ResourceRouterError::Workers)?;
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

pub(crate) fn describe(error: &dyn std::error::Error) -> String {
    let mut description = error.to_string();
    let mut cause = error.source();
    while let Some(source) = cause {
        description.push_str(": ");
        description.push_str(&source.to_string());
        cause = source.source();
    }
    description
}
