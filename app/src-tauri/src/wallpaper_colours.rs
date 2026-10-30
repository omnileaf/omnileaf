use serde::{Deserialize, Serialize};
use specta::Type;

#[cfg(target_os = "android")]
pub(crate) use android::{plugin, read};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ColourRoles {
    primary: u32,
    on_primary: u32,
    secondary_container: u32,
    on_secondary_container: u32,
    tertiary_container: u32,
    on_tertiary_container: u32,
    surface: u32,
    surface_container_low: u32,
    surface_container: u32,
    surface_container_highest: u32,
    on_surface: u32,
    on_surface_variant: u32,
    outline: u32,
    outline_variant: u32,
    inverse_surface: u32,
    inverse_on_surface: u32,
    inverse_primary: u32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
pub(crate) struct WallpaperColours {
    light: ColourRoles,
    dark: ColourRoles,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Type)]
pub(crate) struct AccentColours {
    light: u32,
    dark: u32,
}

#[cfg(windows)]
const ACCENT_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Explorer\Accent";
#[cfg(windows)]
const ACCENT_PALETTE: &str = "AccentPalette";

#[cfg(windows)]
pub(crate) fn read_accent() -> Option<AccentColours> {
    omnileaf_windows_probes::user_binary_value(ACCENT_KEY, ACCENT_PALETTE)
        .and_then(|palette| accent_from_palette(&palette))
}

#[cfg(not(windows))]
pub(crate) fn read_accent() -> Option<AccentColours> {
    None
}

#[cfg(any(test, windows))]
const PALETTE_ENTRY_BYTES: usize = 4;

/// Windows keeps its accent as eight RGBX shades from `AccentLight3` to a spare, and `WinUI` fills with `AccentDark1` in light theme and `AccentLight2` in dark.
#[cfg(any(test, windows))]
fn accent_from_palette(palette: &[u8]) -> Option<AccentColours> {
    let (shades, []) = palette.as_chunks::<PALETTE_ENTRY_BYTES>() else {
        return None;
    };
    let [
        _light_3,
        light_2,
        _light_1,
        _accent,
        dark_1,
        _dark_2,
        _dark_3,
        _spare,
    ] = shades
    else {
        return None;
    };
    Some(AccentColours {
        light: rgb_of(*dark_1),
        dark: rgb_of(*light_2),
    })
}

#[cfg(any(test, windows))]
fn rgb_of([red, green, blue, _unused]: [u8; PALETTE_ENTRY_BYTES]) -> u32 {
    u32::from_be_bytes([0, red, green, blue])
}

#[derive(Debug, Deserialize)]
#[cfg_attr(
    not(any(test, target_os = "android")),
    expect(dead_code, reason = "only Android reads colours from its wallpaper")
)]
struct WallpaperReply {
    colours: Option<WallpaperColours>,
}

#[cfg(not(target_os = "android"))]
#[expect(
    clippy::unused_async,
    reason = "only Android waits for its wallpaper colours"
)]
pub(crate) async fn read(
    _app: &tauri::AppHandle,
) -> Result<Option<WallpaperColours>, crate::ipc_error::IpcError> {
    Ok(None)
}

#[cfg(target_os = "android")]
mod android {
    use std::time::Duration;

    use tauri::{
        AppHandle, Manager, Wry,
        plugin::{Builder, PluginHandle, TauriPlugin, mobile::PluginInvokeError},
    };

    use super::{WallpaperColours, WallpaperReply};
    use crate::ipc_error::IpcError;

    const PLUGIN_NAME: &str = "wallpaper-colours";
    const ANDROID_PACKAGE: &str = "app.omnileaf";
    const ANDROID_PLUGIN_CLASS: &str = "WallpaperColoursPlugin";
    const READ: &str = "read";
    const PLUGIN_TIMEOUT: Duration = Duration::from_secs(2);

    struct WallpaperColoursPlugin(PluginHandle<Wry>);

    #[derive(Debug, thiserror::Error)]
    enum WallpaperColoursError {
        #[error("the wallpaper colours plugin is not registered")]
        NotRegistered,
        #[error("read the colours Android takes from the wallpaper")]
        Plugin(#[from] PluginInvokeError),
        #[error("Android took too long to give the colours it takes from the wallpaper")]
        TimedOut,
    }

    pub(crate) fn plugin() -> TauriPlugin<Wry> {
        Builder::new(PLUGIN_NAME)
            .setup(|app, api| {
                let handle = api.register_android_plugin(ANDROID_PACKAGE, ANDROID_PLUGIN_CLASS)?;
                app.manage(WallpaperColoursPlugin(handle));
                Ok(())
            })
            .build()
    }

    pub(crate) async fn read(app: &AppHandle) -> Result<Option<WallpaperColours>, IpcError> {
        ask(app).await.map_err(|error| IpcError::internal(&error))
    }

    async fn ask(app: &AppHandle) -> Result<Option<WallpaperColours>, WallpaperColoursError> {
        let plugin = app
            .try_state::<WallpaperColoursPlugin>()
            .ok_or(WallpaperColoursError::NotRegistered)?;
        let reply = tokio::time::timeout(
            PLUGIN_TIMEOUT,
            plugin.0.run_mobile_plugin_async::<WallpaperReply>(READ, ()),
        )
        .await
        .map_err(|_elapsed| WallpaperColoursError::TimedOut)??;
        Ok(reply.colours)
    }
}

#[cfg(test)]
mod tests {
    use super::{AccentColours, WallpaperReply, accent_from_palette};

    const DEFAULT_BLUE_PALETTE: [u8; 32] = [
        0x99, 0xeb, 0xff, 0x00, 0x4c, 0xc2, 0xff, 0x00, 0x00, 0x91, 0xf8, 0x00, 0x00, 0x78, 0xd4,
        0x00, 0x00, 0x67, 0xc0, 0x00, 0x00, 0x3e, 0x92, 0x00, 0x00, 0x1a, 0x68, 0x00, 0xf7, 0x63,
        0x0c, 0x00,
    ];

    const ROLES: [&str; 17] = [
        "primary",
        "onPrimary",
        "secondaryContainer",
        "onSecondaryContainer",
        "tertiaryContainer",
        "onTertiaryContainer",
        "surface",
        "surfaceContainerLow",
        "surfaceContainer",
        "surfaceContainerHighest",
        "onSurface",
        "onSurfaceVariant",
        "outline",
        "outlineVariant",
        "inverseSurface",
        "inverseOnSurface",
        "inversePrimary",
    ];

    fn roles(colour: u32) -> serde_json::Value {
        ROLES
            .iter()
            .map(|role| ((*role).to_owned(), serde_json::json!(colour)))
            .collect()
    }

    #[test]
    fn reads_both_themes_of_colours_as_android_sends_them() {
        let sent = serde_json::json!({ "colours": { "light": roles(0x41_61_89), "dark": roles(0xb1_c8_ec) } });

        let reply: WallpaperReply = serde_json::from_value(sent).unwrap();

        let colours = serde_json::to_value(reply.colours).unwrap();
        assert_eq!(colours["light"]["surfaceContainerLow"], 0x41_61_89);
        assert_eq!(colours["dark"]["inversePrimary"], 0xb1_c8_ec);
    }

    #[test]
    fn reads_no_colours_where_android_has_none() {
        let reply: WallpaperReply =
            serde_json::from_value(serde_json::json!({ "colours": null })).unwrap();

        assert_eq!(reply.colours, None);
    }

    #[test]
    fn takes_accent_dark_1_for_light_and_accent_light_2_for_dark_from_the_palette() {
        let colours = accent_from_palette(&DEFAULT_BLUE_PALETTE);

        assert_eq!(
            colours,
            Some(AccentColours {
                light: 0x00_67_c0,
                dark: 0x4c_c2_ff,
            })
        );
    }

    #[test]
    fn ignores_the_fourth_byte_of_each_shade() {
        let mut palette = DEFAULT_BLUE_PALETTE;
        palette
            .iter_mut()
            .skip(3)
            .step_by(4)
            .for_each(|byte| *byte = 0xff);

        let colours = accent_from_palette(&palette);

        assert_eq!(
            colours,
            Some(AccentColours {
                light: 0x00_67_c0,
                dark: 0x4c_c2_ff,
            })
        );
    }

    #[test]
    fn reads_no_accent_from_a_palette_of_another_length() {
        let short = DEFAULT_BLUE_PALETTE.get(..28).unwrap();
        let long = [DEFAULT_BLUE_PALETTE.as_slice(), &[0; 4]].concat();

        let read = [&[][..], short, &long].map(accent_from_palette);

        assert_eq!(read, [None, None, None]);
    }
}
