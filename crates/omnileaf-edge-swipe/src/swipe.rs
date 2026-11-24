use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub enum SwipeEdge {
    Left,
    Right,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum BackSwipe {
    Started {
        progress: f64,
        edge: SwipeEdge,
        #[serde(rename = "touchY")]
        touch_y: f64,
        corner: f64,
    },
    Moved {
        progress: f64,
        #[specta(optional)]
        edge: Option<SwipeEdge>,
        #[serde(rename = "touchY")]
        #[specta(optional)]
        touch_y: Option<f64>,
        #[specta(optional)]
        corner: Option<f64>,
    },
    Released {
        progress: f64,
        velocity: f64,
    },
    Cancelled,
}
