#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Resource {
    Immutable {
        content_type: &'static str,
        body: Vec<u8>,
    },
    NotFound,
    Failed,
}
