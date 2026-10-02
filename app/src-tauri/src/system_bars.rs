//! Shows the system bars' icons in the colour that suits the interface's light or dark theme.

use serde::Deserialize;
use specta::Type;

#[cfg(target_os = "android")]
pub(crate) use android::{match_theme, plugin};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub(crate) enum Theme {
    Light,
    Dark,
}

#[cfg(not(target_os = "android"))]
#[expect(
    clippy::unused_async,
    reason = "only Android waits for its activity to restyle the bars"
)]
pub(crate) async fn match_theme(_app: &tauri::AppHandle, _theme: Theme) {}

#[cfg(target_os = "android")]
mod android {
    use serde::Serialize;
    use tauri::{
        AppHandle, Manager, Wry,
        plugin::{Builder, PluginHandle, TauriPlugin},
    };

    use super::Theme;

    const PLUGIN_NAME: &str = "system-bars";
    const ANDROID_PACKAGE: &str = "app.omnileaf";
    const ANDROID_PLUGIN_CLASS: &str = "SystemBarsPlugin";
    const SHOW_ICONS: &str = "showIcons";

    struct SystemBars(PluginHandle<Wry>);

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct BarIcons {
        are_dark: bool,
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

    pub(crate) async fn match_theme(app: &AppHandle, theme: Theme) {
        let Some(bars) = app.try_state::<SystemBars>() else {
            tracing::warn!("the system bars plugin is not registered");
            return;
        };
        let icons = BarIcons {
            are_dark: theme == Theme::Light,
        };
        if let Err(error) = bars
            .0
            .run_mobile_plugin_async::<()>(SHOW_ICONS, icons)
            .await
        {
            tracing::warn!(%error, ?theme, "match the system bar icons to the theme");
        }
    }
}
