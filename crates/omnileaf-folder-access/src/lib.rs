//! Picks folders through the iOS Files app and opens them again on later launches.

#[cfg(target_os = "ios")]
mod ios;
mod reply;

#[cfg(target_os = "ios")]
pub use ios::{FolderAccess, init};
pub use reply::{PickedFolder, ReopenedFolder};
