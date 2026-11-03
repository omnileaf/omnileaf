use serde::{Deserialize, Serialize};
use specta::Type;

#[cfg(target_os = "android")]
pub(crate) use android::{plugin, read};

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SystemAppLanguage {
    offered: bool,
    tag: Option<String>,
}

#[cfg(not(target_os = "android"))]
#[expect(
    clippy::unused_async,
    reason = "only Android waits for the language its settings name"
)]
pub(crate) async fn read(
    _app: &tauri::AppHandle,
) -> Result<SystemAppLanguage, crate::ipc_error::IpcError> {
    Ok(SystemAppLanguage::default())
}

#[cfg(target_os = "android")]
mod android {
    use std::time::Duration;

    use tauri::{
        AppHandle, Manager, Wry,
        plugin::{Builder, PluginHandle, TauriPlugin, mobile::PluginInvokeError},
    };

    use super::SystemAppLanguage;
    use crate::ipc_error::IpcError;

    const PLUGIN_NAME: &str = "system-app-language";
    const ANDROID_PACKAGE: &str = "app.omnileaf";
    const ANDROID_PLUGIN_CLASS: &str = "SystemAppLanguagePlugin";
    const READ: &str = "read";
    const PLUGIN_TIMEOUT: Duration = Duration::from_secs(2);

    struct SystemAppLanguagePlugin(PluginHandle<Wry>);

    #[derive(Debug, thiserror::Error)]
    enum SystemAppLanguageError {
        #[error("the system app language plugin is not registered")]
        NotRegistered,
        #[error("read the language Android's settings name for the app")]
        Plugin(#[from] PluginInvokeError),
        #[error("Android took too long to give the language its settings name for the app")]
        TimedOut,
    }

    pub(crate) fn plugin() -> TauriPlugin<Wry> {
        Builder::new(PLUGIN_NAME)
            .setup(|app, api| {
                let handle = api.register_android_plugin(ANDROID_PACKAGE, ANDROID_PLUGIN_CLASS)?;
                app.manage(SystemAppLanguagePlugin(handle));
                Ok(())
            })
            .build()
    }

    pub(crate) async fn read(app: &AppHandle) -> Result<SystemAppLanguage, IpcError> {
        ask(app).await.map_err(|error| IpcError::internal(&error))
    }

    async fn ask(app: &AppHandle) -> Result<SystemAppLanguage, SystemAppLanguageError> {
        let plugin = app
            .try_state::<SystemAppLanguagePlugin>()
            .ok_or(SystemAppLanguageError::NotRegistered)?;
        Ok(tokio::time::timeout(
            PLUGIN_TIMEOUT,
            plugin
                .0
                .run_mobile_plugin_async::<SystemAppLanguage>(READ, ()),
        )
        .await
        .map_err(|_elapsed| SystemAppLanguageError::TimedOut)??)
    }
}

#[cfg(test)]
mod tests {
    use super::SystemAppLanguage;

    #[test]
    fn reads_the_language_android_sends() {
        let sent = serde_json::json!({ "offered": true, "tag": "pt-BR" });

        let reply: SystemAppLanguage = serde_json::from_value(sent).unwrap();

        assert_eq!(
            reply,
            SystemAppLanguage {
                offered: true,
                tag: Some("pt-BR".to_owned())
            }
        );
    }

    #[test]
    fn reads_no_language_where_the_settings_name_none() {
        let sent = serde_json::json!({ "offered": true, "tag": null });

        let reply: SystemAppLanguage = serde_json::from_value(sent).unwrap();

        assert_eq!(reply.tag, None);
    }

    #[test]
    fn offers_nothing_before_android_13() {
        let sent = serde_json::json!({ "offered": false, "tag": null });

        let reply: SystemAppLanguage = serde_json::from_value(sent).unwrap();

        assert_eq!(reply, SystemAppLanguage::default());
    }
}
