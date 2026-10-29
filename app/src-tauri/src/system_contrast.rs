use serde::Serialize;
use specta::Type;

#[cfg(target_os = "android")]
pub(crate) use android::{plugin, watch};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "lowercase")]
#[cfg_attr(
    not(test),
    expect(
        dead_code,
        reason = "Android hands the contrast to the interface without Rust making any"
    )
)]
pub(crate) enum SystemContrast {
    Standard,
    Medium,
    High,
}

#[cfg(not(target_os = "android"))]
#[expect(
    clippy::unused_async,
    reason = "only Android waits for its contrast to be watched"
)]
pub(crate) async fn watch(
    _app: &tauri::AppHandle,
    _on_change: tauri::ipc::Channel<SystemContrast>,
) -> Result<(), crate::ipc_error::IpcError> {
    Ok(())
}

#[cfg(target_os = "android")]
mod android {
    use serde::Serialize;
    use tauri::{
        AppHandle, Manager, Wry,
        ipc::Channel,
        plugin::{Builder, PluginHandle, TauriPlugin, mobile::PluginInvokeError},
    };

    use super::SystemContrast;
    use crate::ipc_error::IpcError;

    const PLUGIN_NAME: &str = "system-contrast";
    const ANDROID_PACKAGE: &str = "app.omnileaf";
    const ANDROID_PLUGIN_CLASS: &str = "SystemContrastPlugin";
    const WATCH: &str = "watch";

    struct SystemContrastPlugin(PluginHandle<Wry>);

    #[derive(Debug, thiserror::Error)]
    enum SystemContrastError {
        #[error("the system contrast plugin is not registered")]
        NotRegistered,
        #[error("watch Android's colour contrast")]
        Plugin(#[from] PluginInvokeError),
    }

    #[derive(Serialize)]
    struct Watching {
        channel: Channel<SystemContrast>,
    }

    pub(crate) fn plugin() -> TauriPlugin<Wry> {
        Builder::new(PLUGIN_NAME)
            .setup(|app, api| {
                let handle = api.register_android_plugin(ANDROID_PACKAGE, ANDROID_PLUGIN_CLASS)?;
                app.manage(SystemContrastPlugin(handle));
                Ok(())
            })
            .build()
    }

    pub(crate) async fn watch(
        app: &AppHandle,
        on_change: Channel<SystemContrast>,
    ) -> Result<(), IpcError> {
        ask_to_watch(app, on_change)
            .await
            .map_err(|error| IpcError::internal(&error))
    }

    async fn ask_to_watch(
        app: &AppHandle,
        on_change: Channel<SystemContrast>,
    ) -> Result<(), SystemContrastError> {
        app.try_state::<SystemContrastPlugin>()
            .ok_or(SystemContrastError::NotRegistered)?
            .0
            .run_mobile_plugin_async::<()>(WATCH, Watching { channel: on_change })
            .await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::SystemContrast;

    #[test]
    fn names_the_contrast_levels_as_android_sends_them() {
        let names = [
            SystemContrast::Standard,
            SystemContrast::Medium,
            SystemContrast::High,
        ]
        .map(|level| serde_json::to_value(level).unwrap());

        assert_eq!(
            names,
            [
                serde_json::json!("standard"),
                serde_json::json!("medium"),
                serde_json::json!("high")
            ]
        );
    }
}
