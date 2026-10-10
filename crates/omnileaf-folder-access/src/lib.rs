//! Picks folders through the system's own picker and reads them again on later launches.

mod grants;
#[cfg(target_os = "ios")]
mod ios;
mod reply;

pub use grants::{PersistedGrant, grants_to_release};
#[cfg(target_os = "ios")]
pub use ios::{FolderAccess, init};
pub use reply::{PickedFolder, ReopenedFolder};
