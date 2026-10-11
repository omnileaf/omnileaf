use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum SwipeEdge {
    Left,
    Right,
}

/// How far a swipe from the edge has come, as a share of the screen's width, and how fast it was going in screen widths a second when let go.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum BackSwipe {
    Moved { progress: f64 },
    Released { progress: f64, velocity: f64 },
    Cancelled,
}
