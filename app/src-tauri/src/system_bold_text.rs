#[cfg(target_os = "android")]
pub(crate) use android::{plugin, watch};

#[cfg(not(target_os = "android"))]
#[expect(
    clippy::unused_async,
    reason = "only Android waits for its Bold text to be watched"
)]
pub(crate) async fn watch(
    _app: &tauri::AppHandle,
    _on_change: tauri::ipc::Channel<bool>,
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

    use crate::ipc_error::IpcError;

    const PLUGIN_NAME: &str = "system-bold-text";
    const ANDROID_PACKAGE: &str = "app.omnileaf";
    const ANDROID_PLUGIN_CLASS: &str = "SystemBoldTextPlugin";
    const WATCH: &str = "watch";

    struct SystemBoldTextPlugin(PluginHandle<Wry>);

    #[derive(Debug, thiserror::Error)]
    enum SystemBoldTextError {
        #[error("the system bold text plugin is not registered")]
        NotRegistered,
        #[error("watch Android's Bold text")]
        Plugin(#[from] PluginInvokeError),
    }

    #[derive(Serialize)]
    struct Watching {
        channel: Channel<bool>,
    }

    pub(crate) fn plugin() -> TauriPlugin<Wry> {
        Builder::new(PLUGIN_NAME)
            .setup(|app, api| {
                let handle = api.register_android_plugin(ANDROID_PACKAGE, ANDROID_PLUGIN_CLASS)?;
                app.manage(SystemBoldTextPlugin(handle));
                Ok(())
            })
            .build()
    }

    pub(crate) async fn watch(app: &AppHandle, on_change: Channel<bool>) -> Result<(), IpcError> {
        ask_to_watch(app, on_change)
            .await
            .map_err(|error| IpcError::internal(&error))
    }

    async fn ask_to_watch(
        app: &AppHandle,
        on_change: Channel<bool>,
    ) -> Result<(), SystemBoldTextError> {
        app.try_state::<SystemBoldTextPlugin>()
            .ok_or(SystemBoldTextError::NotRegistered)?
            .0
            .run_mobile_plugin_async::<()>(WATCH, Watching { channel: on_change })
            .await?;
        Ok(())
    }
}
