mod document_tree;
mod grants;
#[cfg(target_os = "ios")]
mod ios;
#[cfg_attr(
    not(any(target_os = "android", test)),
    expect(dead_code, reason = "only Android's folders have a place to work out")
)]
mod place;
mod reply;
#[cfg_attr(
    not(any(target_os = "android", test)),
    expect(dead_code, reason = "only the Android plugin sends and answers these")
)]
mod tree_messages;

pub use document_tree::{Document, DocumentId, DocumentTree, Documents};
pub use grants::{PersistedGrant, grants_to_release};
#[cfg(target_os = "ios")]
pub use ios::{FolderAccess, init};
pub use reply::{PickedFolder, ReopenedFolder};
