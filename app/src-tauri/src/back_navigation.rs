#[cfg(target_os = "android")]
pub(crate) use android::{follow_history, plugin};

#[cfg(not(target_os = "android"))]
#[expect(
    clippy::unused_async,
    reason = "only Android waits for its back gesture to follow the page's history"
)]
pub(crate) async fn follow_history(
    _app: &tauri::AppHandle,
) -> Result<(), crate::ipc_error::IpcError> {
    Ok(())
}

#[cfg(target_os = "android")]
mod android {
    use tauri::{
        AppHandle, Manager, Wry,
        plugin::{Builder, PluginHandle, TauriPlugin, mobile::PluginInvokeError},
    };

    use crate::ipc_error::IpcError;

    const PLUGIN_NAME: &str = "back-navigation";
    const ANDROID_PACKAGE: &str = "app.omnileaf";
    const ANDROID_PLUGIN_CLASS: &str = "BackNavigationPlugin";
    const FOLLOW_HISTORY: &str = "followHistory";

    struct BackNavigationPlugin(PluginHandle<Wry>);

    #[derive(Debug, thiserror::Error)]
    enum BackNavigationError {
        #[error("the back navigation plugin is not registered")]
        NotRegistered,
        #[error("match Android's back gesture to the page's history")]
        Plugin(#[from] PluginInvokeError),
    }

    pub(crate) fn plugin() -> TauriPlugin<Wry> {
        Builder::new(PLUGIN_NAME)
            .setup(|app, api| {
                let handle = api.register_android_plugin(ANDROID_PACKAGE, ANDROID_PLUGIN_CLASS)?;
                app.manage(BackNavigationPlugin(handle));
                Ok(())
            })
            .build()
    }

    pub(crate) async fn follow_history(app: &AppHandle) -> Result<(), IpcError> {
        ask(app).await.map_err(|error| IpcError::internal(&error))
    }

    async fn ask(app: &AppHandle) -> Result<(), BackNavigationError> {
        app.try_state::<BackNavigationPlugin>()
            .ok_or(BackNavigationError::NotRegistered)?
            .0
            .run_mobile_plugin_async::<()>(FOLLOW_HISTORY, ())
            .await?;
        Ok(())
    }
}
