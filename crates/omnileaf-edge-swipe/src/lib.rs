#[cfg(target_os = "ios")]
mod ios;
mod swipe;

#[cfg(target_os = "ios")]
pub use ios::{EdgeSwipe, init};
pub use swipe::{BackSwipe, SwipeEdge};
