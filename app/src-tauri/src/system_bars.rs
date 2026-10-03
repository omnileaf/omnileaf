//! Shows the system bars' icons in the colour that suits the interface's light or dark theme.

use serde::{Deserialize, Serialize};
use specta::Type;

#[cfg(target_os = "android")]
pub(crate) use android::{match_theme, plugin};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub(crate) enum Theme {
    Light,
    Dark,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    not(any(target_os = "android", test)),
    expect(dead_code, reason = "only Android restyles its system bar icons")
)]
struct BarIcons {
    are_dark: bool,
}

#[cfg_attr(
    not(any(target_os = "android", test)),
    expect(dead_code, reason = "only Android restyles its system bar icons")
)]
impl BarIcons {
    fn for_theme(theme: Theme) -> Self {
        Self {
            are_dark: theme == Theme::Light,
        }
    }
}

#[cfg(not(target_os = "android"))]
#[expect(
    clippy::unused_async,
    reason = "only Android waits for its activity to restyle the bars"
)]
pub(crate) async fn match_theme(
    _app: &tauri::AppHandle,
    _theme: Theme,
) -> Result<(), crate::ipc_error::IpcError> {
    Ok(())
}

#[cfg(target_os = "android")]
mod android {
    use tauri::{
        AppHandle, Manager, Wry,
        plugin::{Builder, PluginHandle, TauriPlugin, mobile::PluginInvokeError},
    };

    use super::{BarIcons, Theme};
    use crate::ipc_error::IpcError;

    const PLUGIN_NAME: &str = "system-bars";
    const ANDROID_PACKAGE: &str = "app.omnileaf";
    const ANDROID_PLUGIN_CLASS: &str = "SystemBarsPlugin";
    const SHOW_ICONS: &str = "showIcons";

    struct SystemBars(PluginHandle<Wry>);

    #[derive(Debug, thiserror::Error)]
    enum SystemBarsError {
        #[error("the system bars plugin is not registered")]
        NotRegistered,
        #[error("restyle the system bar icons")]
        Restyle(#[from] PluginInvokeError),
    }

    pub(crate) fn plugin() -> TauriPlugin<Wry> {
        Builder::new(PLUGIN_NAME)
            .setup(|app, api| {
                let handle = api.register_android_plugin(ANDROID_PACKAGE, ANDROID_PLUGIN_CLASS)?;
                app.manage(SystemBars(handle));
                Ok(())
            })
            .build()
    }

    pub(crate) async fn match_theme(app: &AppHandle, theme: Theme) -> Result<(), IpcError> {
        show_icons(app, BarIcons::for_theme(theme))
            .await
            .map_err(|error| IpcError::internal(&error))
    }

    async fn show_icons(app: &AppHandle, icons: BarIcons) -> Result<(), SystemBarsError> {
        let bars = app
            .try_state::<SystemBars>()
            .ok_or(SystemBarsError::NotRegistered)?;
        bars.0
            .run_mobile_plugin_async::<()>(SHOW_ICONS, icons)
            .await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::{BarIcons, Theme};

    #[test]
    fn a_light_theme_asks_for_dark_icons() {
        let icons = BarIcons::for_theme(Theme::Light);

        assert_eq!(icons, BarIcons { are_dark: true });
    }

    #[test]
    fn a_dark_theme_asks_for_light_icons() {
        let icons = BarIcons::for_theme(Theme::Dark);

        assert_eq!(icons, BarIcons { are_dark: false });
    }
}
