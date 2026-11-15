use tauri::{AppHandle, Runtime};
#[cfg(any(target_os = "macos", windows, target_os = "ios"))]
use tauri_plugin_opener::OpenerExt;

#[cfg(target_os = "android")]
pub(crate) use android::plugin;

#[cfg(target_os = "macos")]
const SETTINGS_URL: &str = "x-apple.systempreferences:com.apple.preference.security?Privacy";
#[cfg(windows)]
const SETTINGS_URL: &str = "ms-settings:privacy";
#[cfg(windows)]
const COLOUR_SETTINGS_URL: &str = "ms-settings:colors";
/// iOS opens the app's own page of Settings for `UIApplication.openSettingsURLString`.
#[cfg(target_os = "ios")]
const SETTINGS_URL: &str = "app-settings:";

#[derive(Debug, thiserror::Error)]
pub(crate) enum SystemSettingsError {
    #[cfg_attr(
        not(target_os = "linux"),
        expect(dead_code, reason = "only Linux lacks one settings app")
    )]
    #[error("Linux desktops have no one settings app to open")]
    NoSettingsApp,
    #[cfg_attr(
        windows,
        expect(dead_code, reason = "only Windows has a page of colour settings")
    )]
    #[error("only Windows has a page of colour settings to open")]
    NoColourSettings,
    #[cfg_attr(
        target_os = "android",
        expect(
            dead_code,
            reason = "only Android has a page of accessibility settings"
        )
    )]
    #[error("only Android has a page of accessibility settings to open")]
    AccessibilitySettingsAndroidOnly,
    #[cfg(any(target_os = "macos", windows, target_os = "ios"))]
    #[error("open the system's settings")]
    Opener(#[from] tauri_plugin_opener::Error),
    #[cfg(target_os = "android")]
    #[error("open a page of Android's settings")]
    Android(#[from] android::AppSettingsError),
}

#[cfg(any(target_os = "macos", windows, target_os = "ios"))]
pub(crate) fn open<R: Runtime>(app: &AppHandle<R>) -> Result<(), SystemSettingsError> {
    Ok(app.opener().open_url(SETTINGS_URL, None::<&str>)?)
}

#[cfg(target_os = "android")]
pub(crate) fn open<R: Runtime>(app: &AppHandle<R>) -> Result<(), SystemSettingsError> {
    Ok(android::open_app_settings(app)?)
}

#[cfg(target_os = "linux")]
pub(crate) fn open<R: Runtime>(_app: &AppHandle<R>) -> Result<(), SystemSettingsError> {
    Err(SystemSettingsError::NoSettingsApp)
}

#[cfg(windows)]
pub(crate) fn open_colours<R: Runtime>(app: &AppHandle<R>) -> Result<(), SystemSettingsError> {
    Ok(app.opener().open_url(COLOUR_SETTINGS_URL, None::<&str>)?)
}

#[cfg(not(windows))]
pub(crate) fn open_colours<R: Runtime>(_app: &AppHandle<R>) -> Result<(), SystemSettingsError> {
    Err(SystemSettingsError::NoColourSettings)
}

#[cfg(target_os = "android")]
pub(crate) fn open_accessibility<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<(), SystemSettingsError> {
    Ok(android::open_accessibility_settings(app)?)
}

#[cfg(not(target_os = "android"))]
pub(crate) fn open_accessibility<R: Runtime>(
    _app: &AppHandle<R>,
) -> Result<(), SystemSettingsError> {
    Err(SystemSettingsError::AccessibilitySettingsAndroidOnly)
}

#[cfg(target_os = "android")]
mod android {
    use tauri::{
        AppHandle, Manager, Runtime,
        plugin::{Builder, PluginHandle, TauriPlugin, mobile::PluginInvokeError},
    };

    const PLUGIN_NAME: &str = "app-settings";
    const ANDROID_PACKAGE: &str = "app.omnileaf";
    const ANDROID_PLUGIN_CLASS: &str = "AppSettingsPlugin";
    const OPEN_APP_SETTINGS: &str = "openAppSettings";
    const OPEN_ACCESSIBILITY_SETTINGS: &str = "openAccessibilitySettings";

    struct AppSettingsPlugin<R: Runtime>(PluginHandle<R>);

    #[derive(Debug, thiserror::Error)]
    pub(crate) enum AppSettingsError {
        #[error("the app settings plugin is not registered")]
        NotRegistered,
        #[error("ask Android to show its settings")]
        Open(#[from] PluginInvokeError),
    }

    pub(crate) fn plugin<R: Runtime>() -> TauriPlugin<R> {
        Builder::new(PLUGIN_NAME)
            .setup(|app, api| {
                let handle = api.register_android_plugin(ANDROID_PACKAGE, ANDROID_PLUGIN_CLASS)?;
                app.manage(AppSettingsPlugin(handle));
                Ok(())
            })
            .build()
    }

    pub(super) fn open_app_settings<R: Runtime>(
        app: &AppHandle<R>,
    ) -> Result<(), AppSettingsError> {
        show(app, OPEN_APP_SETTINGS)
    }

    pub(super) fn open_accessibility_settings<R: Runtime>(
        app: &AppHandle<R>,
    ) -> Result<(), AppSettingsError> {
        show(app, OPEN_ACCESSIBILITY_SETTINGS)
    }

    fn show<R: Runtime>(app: &AppHandle<R>, command: &str) -> Result<(), AppSettingsError> {
        let plugin = app
            .try_state::<AppSettingsPlugin<R>>()
            .ok_or(AppSettingsError::NotRegistered)?;
        Ok(plugin.0.run_mobile_plugin(command, ())?)
    }
}

#[cfg(all(test, target_os = "linux"))]
mod tests {
    use super::*;

    #[test]
    fn has_no_settings_app_to_open_on_linux() {
        let app = tauri::test::mock_app();

        let opened = open(app.handle());

        assert!(matches!(opened, Err(SystemSettingsError::NoSettingsApp)));
    }

    #[test]
    fn has_no_colour_settings_to_open_on_linux() {
        let app = tauri::test::mock_app();

        let opened = open_colours(app.handle());

        assert!(matches!(opened, Err(SystemSettingsError::NoColourSettings)));
    }

    #[test]
    fn has_no_accessibility_settings_to_open_on_linux() {
        let app = tauri::test::mock_app();

        let opened = open_accessibility(app.handle());

        assert!(matches!(
            opened,
            Err(SystemSettingsError::AccessibilitySettingsAndroidOnly)
        ));
    }
}
