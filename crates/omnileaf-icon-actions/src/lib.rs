#[cfg(target_os = "ios")]
mod ios;
mod shortcut;

#[cfg(target_os = "ios")]
pub use ios::{IconActions, init};
pub use shortcut::{IconAction, IconShortcut};
