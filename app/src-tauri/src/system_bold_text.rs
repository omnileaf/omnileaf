use serde::Deserialize;

#[cfg(target_os = "android")]
pub(crate) use android::{plugin, read};

#[cfg(not(target_os = "android"))]
#[expect(
    clippy::unused_async,
    reason = "only Android waits for its Bold text setting"
)]
pub(crate) async fn read(_app: &tauri::AppHandle) -> Result<bool, crate::ipc_error::IpcError> {
    Ok(false)
}

#[cfg_attr(
    not(any(target_os = "android", test)),
    expect(dead_code, reason = "only Android reads its Bold text natively")
)]
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BoldTextReading {
    is_bold: bool,
}

#[cfg(target_os = "android")]
mod android {
    use std::time::Duration;

    use tauri::{
        AppHandle, Manager, Wry,
        plugin::{Builder, PluginHandle, TauriPlugin, mobile::PluginInvokeError},
    };

    use super::BoldTextReading;
    use crate::ipc_error::IpcError;

    const PLUGIN_NAME: &str = "system-bold-text";
    const ANDROID_PACKAGE: &str = "app.omnileaf";
    const ANDROID_PLUGIN_CLASS: &str = "SystemBoldTextPlugin";
    const READ: &str = "read";
    const PLUGIN_TIMEOUT: Duration = Duration::from_secs(2);

    struct SystemBoldTextPlugin(PluginHandle<Wry>);

    #[derive(Debug, thiserror::Error)]
    enum SystemBoldTextError {
        #[error("the system bold text plugin is not registered")]
        NotRegistered,
        #[error("read whether Android's Bold text is on")]
        Plugin(#[from] PluginInvokeError),
        #[error("Android took too long to say whether its Bold text is on")]
        TimedOut,
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

    pub(crate) async fn read(app: &AppHandle) -> Result<bool, IpcError> {
        ask(app)
            .await
            .map(|reading| reading.is_bold)
            .map_err(|error| IpcError::internal(&error))
    }

    async fn ask(app: &AppHandle) -> Result<BoldTextReading, SystemBoldTextError> {
        let plugin = app
            .try_state::<SystemBoldTextPlugin>()
            .ok_or(SystemBoldTextError::NotRegistered)?;
        Ok(tokio::time::timeout(
            PLUGIN_TIMEOUT,
            plugin
                .0
                .run_mobile_plugin_async::<BoldTextReading>(READ, ()),
        )
        .await
        .map_err(|_elapsed| SystemBoldTextError::TimedOut)??)
    }
}

#[cfg(test)]
mod tests {
    use super::BoldTextReading;

    #[test]
    fn reads_the_bold_text_android_sends() {
        let readings = [true, false]
            .map(|is_bold| serde_json::json!({ "isBold": is_bold }))
            .map(|sent| {
                serde_json::from_value::<BoldTextReading>(sent)
                    .unwrap()
                    .is_bold
            });

        assert_eq!(readings, [true, false]);
    }
}
