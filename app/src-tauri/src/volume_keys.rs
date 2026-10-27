use serde::Serialize;
use specta::Type;

#[cfg(target_os = "android")]
pub(crate) use android::{capture, plugin, release};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    not(test),
    expect(
        dead_code,
        reason = "Android hands the page turns to the interface without Rust making any"
    )
)]
pub(crate) enum PageTurn {
    Previous,
    Next,
}

#[cfg(not(target_os = "android"))]
#[expect(
    clippy::unused_async,
    reason = "only Android waits for its volume keys to be captured"
)]
pub(crate) async fn capture(
    _app: &tauri::AppHandle,
    _on_turn: tauri::ipc::Channel<PageTurn>,
) -> Result<(), crate::ipc_error::IpcError> {
    Ok(())
}

#[cfg(not(target_os = "android"))]
#[expect(
    clippy::unused_async,
    reason = "only Android waits for its volume keys to be released"
)]
pub(crate) async fn release(_app: &tauri::AppHandle) -> Result<(), crate::ipc_error::IpcError> {
    Ok(())
}

#[cfg(target_os = "android")]
mod android {
    use serde::Serialize;
    use tauri::{
        AppHandle, Manager, State, Wry,
        ipc::Channel,
        plugin::{Builder, PluginHandle, TauriPlugin, mobile::PluginInvokeError},
        webview::PageLoadEvent,
    };

    use super::PageTurn;
    use crate::ipc_error::IpcError;

    const PLUGIN_NAME: &str = "volume-keys";
    const ANDROID_PACKAGE: &str = "app.omnileaf";
    const ANDROID_PLUGIN_CLASS: &str = "VolumeKeysPlugin";
    const CAPTURE: &str = "capture";
    const RELEASE: &str = "release";

    struct VolumeKeys(PluginHandle<Wry>);

    #[derive(Debug, thiserror::Error)]
    enum VolumeKeysError {
        #[error("the volume keys plugin is not registered")]
        NotRegistered,
        #[error("hand the volume keys to or from Android")]
        Plugin(#[from] PluginInvokeError),
    }

    #[derive(Serialize)]
    struct Capturing {
        channel: Channel<PageTurn>,
    }

    pub(crate) fn plugin() -> TauriPlugin<Wry> {
        Builder::new(PLUGIN_NAME)
            .setup(|app, api| {
                let handle = api.register_android_plugin(ANDROID_PACKAGE, ANDROID_PLUGIN_CLASS)?;
                app.manage(VolumeKeys(handle));
                Ok(())
            })
            .on_page_load(|webview, payload| {
                if matches!(payload.event(), PageLoadEvent::Started) {
                    release_for_the_new_page(webview.app_handle().clone());
                }
            })
            .build()
    }

    fn registered(app: &AppHandle) -> Result<State<'_, VolumeKeys>, VolumeKeysError> {
        app.try_state::<VolumeKeys>()
            .ok_or(VolumeKeysError::NotRegistered)
    }

    pub(crate) async fn capture(
        app: &AppHandle,
        on_turn: Channel<PageTurn>,
    ) -> Result<(), IpcError> {
        ask(app, CAPTURE, Capturing { channel: on_turn })
            .await
            .map_err(|error| IpcError::internal(&error))
    }

    pub(crate) async fn release(app: &AppHandle) -> Result<(), IpcError> {
        ask(app, RELEASE, ())
            .await
            .map_err(|error| IpcError::internal(&error))
    }

    fn release_for_the_new_page(app: AppHandle) {
        tauri::async_runtime::spawn(async move {
            if let Err(error) = ask(&app, RELEASE, ()).await {
                tracing::warn!(error = %omnileaf_engine::describe_error(&error), "give the volume keys back to Android for a new page");
            }
        });
    }

    async fn ask(
        app: &AppHandle,
        command: &str,
        payload: impl Serialize,
    ) -> Result<(), VolumeKeysError> {
        registered(app)?
            .0
            .run_mobile_plugin_async::<()>(command, payload)
            .await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::PageTurn;

    #[test]
    fn names_the_page_turns_as_android_sends_them() {
        let names =
            [PageTurn::Previous, PageTurn::Next].map(|turn| serde_json::to_value(turn).unwrap());

        assert_eq!(
            names,
            [serde_json::json!("previous"), serde_json::json!("next")]
        );
    }
}
