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
