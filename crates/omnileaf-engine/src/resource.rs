const IMMUTABLE: &str = "public, max-age=31536000, immutable";
const NOT_STORED: &str = "no-store";

/// The answer to one `omni` protocol request.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Resource {
    /// Never changes for its path, so the webview may keep it for good.
    Immutable {
        content_type: &'static str,
        body: Vec<u8>,
    },
    NotFound,
    Failed,
}

impl Resource {
    #[must_use]
    pub const fn status_code(&self) -> u16 {
        match self {
            Self::Immutable { .. } => 200,
            Self::NotFound => 404,
            Self::Failed => 500,
        }
    }

    #[must_use]
    pub const fn cache_control(&self) -> &'static str {
        match self {
            Self::Immutable { .. } => IMMUTABLE,
            Self::NotFound | Self::Failed => NOT_STORED,
        }
    }

    #[must_use]
    pub const fn content_type(&self) -> Option<&'static str> {
        match self {
            Self::Immutable { content_type, .. } => Some(content_type),
            Self::NotFound | Self::Failed => None,
        }
    }

    #[must_use]
    pub fn into_body(self) -> Vec<u8> {
        match self {
            Self::Immutable { body, .. } => body,
            Self::NotFound | Self::Failed => Vec::new(),
        }
    }
}
