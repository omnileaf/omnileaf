use serde::{Deserialize, Serialize};
use specta::Type;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum IconAction {
    ScreenshotMode,
    ContinueReading,
    SearchLibrary,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IconShortcut {
    pub action: IconAction,
    pub title: String,
    pub state: Option<String>,
    pub title_with_state: String,
}
