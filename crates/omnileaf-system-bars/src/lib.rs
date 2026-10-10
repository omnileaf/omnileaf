//! Sets the light or dark style of the iOS window, which its status bar follows.

#[cfg(target_os = "ios")]
mod ios;
mod style;

#[cfg(target_os = "ios")]
pub use ios::{SystemBars, init};
pub use style::InterfaceStyle;
