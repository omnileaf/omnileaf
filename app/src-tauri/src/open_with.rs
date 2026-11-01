#[cfg(target_os = "android")]
pub(crate) use android::{plugin, watch};

#[cfg(not(target_os = "android"))]
#[expect(
    clippy::unused_async,
    reason = "only Android hands documents over from Open with and Share"
)]
pub(crate) async fn watch(
    _app: &tauri::AppHandle,
    _on_handed: tauri::ipc::Channel<String>,
) -> Result<(), crate::ipc_error::IpcError> {
    Ok(())
}

#[cfg(target_os = "android")]
mod android {
    use serde::Serialize;
    use tauri::{
        AppHandle, Manager, State, Wry,
        ipc::Channel,
        plugin::{Builder, PluginHandle, TauriPlugin, mobile::PluginInvokeError},
    };

    use crate::ipc_error::IpcError;

    const PLUGIN_NAME: &str = "open-with";
    const ANDROID_PACKAGE: &str = "app.omnileaf";
    const ANDROID_PLUGIN_CLASS: &str = "OpenWithPlugin";
    const WATCH: &str = "watch";

    struct OpenWith(PluginHandle<Wry>);

    #[derive(Debug, thiserror::Error)]
    enum OpenWithError {
        #[error("the open with plugin is not registered")]
        NotRegistered,
        #[error("ask Android for the documents handed to the app")]
        Plugin(#[from] PluginInvokeError),
    }

    #[derive(Serialize)]
    struct Watching {
        channel: Channel<String>,
    }

    pub(crate) fn plugin() -> TauriPlugin<Wry> {
        Builder::new(PLUGIN_NAME)
            .setup(|app, api| {
                let handle = api.register_android_plugin(ANDROID_PACKAGE, ANDROID_PLUGIN_CLASS)?;
                app.manage(OpenWith(handle));
                Ok(())
            })
            .build()
    }

    fn registered(app: &AppHandle) -> Result<State<'_, OpenWith>, OpenWithError> {
        app.try_state::<OpenWith>()
            .ok_or(OpenWithError::NotRegistered)
    }

    pub(crate) async fn watch(app: &AppHandle, on_handed: Channel<String>) -> Result<(), IpcError> {
        registered(app)
            .map_err(|error| IpcError::internal(&error))?
            .0
            .run_mobile_plugin_async::<()>(WATCH, Watching { channel: on_handed })
            .await
            .map_err(|error| IpcError::internal(&OpenWithError::from(error)))
    }
}
