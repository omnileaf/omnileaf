//! Matches the system bars' icons and the window behind the interface to the interface's light or dark theme.

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

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Type)]
#[serde(rename_all = "lowercase")]
pub(crate) enum ThemePreference {
    System,
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

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[cfg_attr(
    not(any(target_os = "android", test)),
    expect(
        dead_code,
        reason = "only Android paints the window behind the interface"
    )
)]
struct PageBackground {
    red: u8,
    green: u8,
    blue: u8,
}

#[cfg_attr(
    not(any(target_os = "android", test)),
    expect(
        dead_code,
        reason = "only Android paints the window behind the interface"
    )
)]
impl PageBackground {
    const LIGHT: Self = Self {
        red: 0xfa,
        green: 0xf8,
        blue: 0xf4,
    };
    const DARK: Self = Self {
        red: 0x16,
        green: 0x15,
        blue: 0x12,
    };

    fn for_theme(theme: Theme) -> Self {
        match theme {
            Theme::Light => Self::LIGHT,
            Theme::Dark => Self::DARK,
        }
    }
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[cfg_attr(
    not(any(target_os = "android", test)),
    expect(
        dead_code,
        reason = "only Android paints the window behind the interface"
    )
)]
struct WindowBackground {
    shown: PageBackground,
    remembered: Option<PageBackground>,
}

#[cfg_attr(
    not(any(target_os = "android", test)),
    expect(
        dead_code,
        reason = "only Android paints the window behind the interface"
    )
)]
impl WindowBackground {
    /// Remembers only a light or dark choice, so a cold start under System keeps following the device's dark mode.
    fn for_appearance(preference: ThemePreference, theme: Theme) -> Self {
        let shown = PageBackground::for_theme(theme);
        let remembered = match preference {
            ThemePreference::System => None,
            ThemePreference::Light => Some(PageBackground::LIGHT),
            ThemePreference::Dark => Some(PageBackground::DARK),
        };
        Self { shown, remembered }
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
    _preference: ThemePreference,
) -> Result<(), crate::ipc_error::IpcError> {
    Ok(())
}

#[cfg(target_os = "android")]
mod android {
    use tauri::{
        AppHandle, Manager, Wry,
        plugin::{Builder, PluginHandle, TauriPlugin, mobile::PluginInvokeError},
    };

    use super::{BarIcons, Theme, ThemePreference, WindowBackground};
    use crate::ipc_error::IpcError;

    const PLUGIN_NAME: &str = "system-bars";
    const ANDROID_PACKAGE: &str = "app.omnileaf";
    const ANDROID_PLUGIN_CLASS: &str = "SystemBarsPlugin";
    const SHOW_ICONS: &str = "showIcons";
    const SHOW_BACKGROUND: &str = "showBackground";

    struct SystemBars(PluginHandle<Wry>);

    #[derive(Debug, thiserror::Error)]
    enum SystemBarsError {
        #[error("the system bars plugin is not registered")]
        NotRegistered,
        #[error("restyle the system bars and the window behind the interface")]
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

    pub(crate) async fn match_theme(
        app: &AppHandle,
        theme: Theme,
        preference: ThemePreference,
    ) -> Result<(), IpcError> {
        restyle(app, theme, preference)
            .await
            .map_err(|error| IpcError::internal(&error))
    }

    async fn restyle(
        app: &AppHandle,
        theme: Theme,
        preference: ThemePreference,
    ) -> Result<(), SystemBarsError> {
        let bars = app
            .try_state::<SystemBars>()
            .ok_or(SystemBarsError::NotRegistered)?;
        bars.0
            .run_mobile_plugin_async::<()>(SHOW_ICONS, BarIcons::for_theme(theme))
            .await?;
        bars.0
            .run_mobile_plugin_async::<()>(
                SHOW_BACKGROUND,
                WindowBackground::for_appearance(preference, theme),
            )
            .await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::{BarIcons, PageBackground, Theme, ThemePreference, WindowBackground};

    const APP_CSS: &str = include_str!("../../src/app.css");
    const DARK_THEME_RULE: &str = ":root[data-theme=\"dark\"] {";
    const BACKGROUND_TOKEN: &str = "--color-background:";
    const ANDROID_COLORS: &str = include_str!("../gen/android/app/src/main/res/values/colors.xml");

    fn first_background_token(css: &str) -> &str {
        let (_, rest) = css
            .split_once(BACKGROUND_TOKEN)
            .expect("the stylesheet defines a page background");
        let (value, _) = rest.split_once(';').expect("the token ends");
        value.trim()
    }

    fn interface_backgrounds() -> (&'static str, &'static str) {
        let (light, dark) = APP_CSS
            .split_once(DARK_THEME_RULE)
            .expect("the stylesheet has a dark theme");
        (first_background_token(light), first_background_token(dark))
    }

    fn android_color(name: &str) -> &'static str {
        let opening = format!("<color name=\"{name}\">");
        let (_, rest) = ANDROID_COLORS
            .split_once(&opening)
            .unwrap_or_else(|| panic!("Android defines the colour {name}"));
        let (value, _) = rest.split_once("</color>").expect("the colour ends");
        value.trim()
    }

    fn css_hex(background: PageBackground) -> String {
        format!(
            "#{:02x}{:02x}{:02x}",
            background.red, background.green, background.blue
        )
    }

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

    #[test]
    fn a_light_theme_paints_the_interfaces_light_page_background() {
        let (light, _) = interface_backgrounds();

        let background = PageBackground::for_theme(Theme::Light);

        assert_eq!(css_hex(background), light);
    }

    #[test]
    fn a_dark_theme_paints_the_interfaces_dark_page_background() {
        let (_, dark) = interface_backgrounds();

        let background = PageBackground::for_theme(Theme::Dark);

        assert_eq!(css_hex(background), dark);
    }

    #[test]
    fn android_starts_a_light_theme_on_the_interfaces_light_page_background() {
        let background = PageBackground::for_theme(Theme::Light);

        let starting_window = android_color("page_background_light");

        assert_eq!(starting_window, css_hex(background));
    }

    #[test]
    fn android_starts_a_dark_theme_on_the_interfaces_dark_page_background() {
        let background = PageBackground::for_theme(Theme::Dark);

        let starting_window = android_color("page_background_dark");

        assert_eq!(starting_window, css_hex(background));
    }

    #[test]
    fn a_chosen_light_theme_is_shown_and_remembered() {
        let background = WindowBackground::for_appearance(ThemePreference::Light, Theme::Light);

        assert_eq!(
            background,
            WindowBackground {
                shown: PageBackground::LIGHT,
                remembered: Some(PageBackground::LIGHT),
            }
        );
    }

    #[test]
    fn a_chosen_dark_theme_is_shown_and_remembered() {
        let background = WindowBackground::for_appearance(ThemePreference::Dark, Theme::Dark);

        assert_eq!(
            background,
            WindowBackground {
                shown: PageBackground::DARK,
                remembered: Some(PageBackground::DARK),
            }
        );
    }

    #[test]
    fn following_the_system_shows_the_devices_theme_without_remembering_it() {
        let background = WindowBackground::for_appearance(ThemePreference::System, Theme::Dark);

        assert_eq!(
            background,
            WindowBackground {
                shown: PageBackground::DARK,
                remembered: None,
            }
        );
    }
}
