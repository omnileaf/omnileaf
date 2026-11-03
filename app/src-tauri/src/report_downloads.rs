use serde::{Deserialize, Serialize};
use tauri::{
    AppHandle, Manager, Runtime,
    plugin::{Builder, PluginHandle, TauriPlugin, mobile::PluginInvokeError},
};

const PLUGIN_NAME: &str = "report-downloads";
const ANDROID_PACKAGE: &str = "app.omnileaf";
const ANDROID_PLUGIN_CLASS: &str = "ReportDownloadsPlugin";
const SAVE_TO_DOWNLOADS: &str = "saveToDownloads";

struct ReportDownloadsPlugin<R: Runtime>(PluginHandle<R>);

#[derive(Debug, thiserror::Error)]
pub(crate) enum ReportDownloadsError {
    #[error("the report downloads plugin is not registered")]
    NotRegistered,
    #[error("ask Android to save the report to Downloads")]
    Save(#[from] PluginInvokeError),
}

#[derive(Serialize)]
struct SaveRequest<'a> {
    name: &'a str,
    text: &'a str,
}

#[derive(Deserialize)]
struct Saved {
    name: String,
}

pub(crate) fn plugin<R: Runtime>() -> TauriPlugin<R> {
    Builder::new(PLUGIN_NAME)
        .setup(|app, api| {
            let handle = api.register_android_plugin(ANDROID_PACKAGE, ANDROID_PLUGIN_CLASS)?;
            app.manage(ReportDownloadsPlugin(handle));
            Ok(())
        })
        .build()
}

/// Android keeps the name it gave the file, which differs from `name` when Downloads already held one.
pub(crate) fn save<R: Runtime>(
    app: &AppHandle<R>,
    name: &str,
    text: &str,
) -> Result<String, ReportDownloadsError> {
    let plugin = app
        .try_state::<ReportDownloadsPlugin<R>>()
        .ok_or(ReportDownloadsError::NotRegistered)?;
    let saved: Saved = plugin
        .0
        .run_mobile_plugin(SAVE_TO_DOWNLOADS, SaveRequest { name, text })?;
    Ok(saved.name)
}
