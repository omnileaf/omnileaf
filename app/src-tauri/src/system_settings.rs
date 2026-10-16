use tauri::{AppHandle, Runtime};
#[cfg(any(target_os = "macos", windows, target_os = "ios"))]
use tauri_plugin_opener::OpenerExt;

#[cfg(target_os = "android")]
pub(crate) use android::plugin;

#[cfg(target_os = "macos")]
const SETTINGS_URL: &str = "x-apple.systempreferences:com.apple.preference.security?Privacy";
#[cfg(windows)]
const SETTINGS_URL: &str = "ms-settings:privacy";
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
    #[cfg(any(target_os = "macos", windows, target_os = "ios"))]
    #[error("open the system's settings")]
    Opener(#[from] tauri_plugin_opener::Error),
    #[cfg(target_os = "android")]
    #[error("open the app's page in Android's settings")]
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

    struct AppSettingsPlugin<R: Runtime>(PluginHandle<R>);

    #[derive(Debug, thiserror::Error)]
    pub(crate) enum AppSettingsError {
        #[error("the app settings plugin is not registered")]
        NotRegistered,
        #[error("ask Android to show the app's settings")]
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
        let plugin = app
            .try_state::<AppSettingsPlugin<R>>()
            .ok_or(AppSettingsError::NotRegistered)?;
        Ok(plugin.0.run_mobile_plugin(OPEN_APP_SETTINGS, ())?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(target_os = "linux")]
    #[test]
    fn has_no_settings_app_to_open_on_linux() {
        let app = tauri::test::mock_app();

        let opened = open(app.handle());

        assert!(matches!(opened, Err(SystemSettingsError::NoSettingsApp)));
    }
}
