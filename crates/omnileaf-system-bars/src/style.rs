use serde::Serialize;

/// The window's light or dark style, in the terms of iOS's `UIUserInterfaceStyle`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum InterfaceStyle {
    Unspecified,
    Light,
    Dark,
}
