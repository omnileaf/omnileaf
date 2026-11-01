#[cfg(target_os = "android")]
mod android;
#[cfg(unix)]
mod descriptor;
mod document_tree;
mod grants;
#[cfg(any(target_os = "android", target_os = "linux"))]
mod handed_document;
#[cfg_attr(
    not(any(target_os = "android", test)),
    expect(dead_code, reason = "only the Android plugin sends and answers these")
)]
#[cfg(any(target_os = "android", target_os = "linux"))]
mod handed_messages;
#[cfg(target_os = "ios")]
mod ios;
#[cfg_attr(
    not(any(target_os = "android", test)),
    expect(dead_code, reason = "only Android's folders have a place to work out")
)]
mod place;
mod reply;
mod streamed_copy;
#[cfg_attr(
    not(any(target_os = "android", test)),
    expect(dead_code, reason = "only the Android plugin sends and answers these")
)]
mod tree_messages;

#[cfg(target_os = "android")]
pub use android::{FolderAccess, init};
pub use document_tree::{Document, DocumentId, DocumentTree, Documents};
pub use grants::{PersistedGrant, grants_to_release};
#[cfg(any(target_os = "android", target_os = "linux"))]
pub use handed_document::{DocumentUri, HandedDocument};
#[cfg(target_os = "ios")]
pub use ios::{FolderAccess, init};
pub use reply::{PickedFolder, ReopenedFolder};
