use serde::Serialize;
use tauri::{
    Manager, Runtime,
    ipc::Channel,
    plugin::{Builder, PluginHandle, TauriPlugin, mobile::PluginInvokeError},
};

use crate::{IconAction, IconShortcut};

tauri::ios_plugin_binding!(init_plugin_icon_actions);

const PLUGIN_NAME: &str = "icon-actions";

pub struct IconActions<R: Runtime>(PluginHandle<R>);

#[derive(Serialize)]
struct Shown<'a> {
    shortcuts: &'a [IconShortcut],
}

#[derive(Serialize)]
struct Watching {
    channel: Channel<IconAction>,
}

#[must_use]
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new(PLUGIN_NAME)
        .setup(|app, api| {
            app.manage(IconActions(
                api.register_ios_plugin(init_plugin_icon_actions)?,
            ));
            Ok(())
        })
        .build()
}

impl<R: Runtime> IconActions<R> {
    pub async fn show(&self, shortcuts: &[IconShortcut]) -> Result<(), PluginInvokeError> {
        self.0
            .run_mobile_plugin_async("show", Shown { shortcuts })
            .await
    }

    pub async fn watch(&self, channel: Channel<IconAction>) -> Result<(), PluginInvokeError> {
        self.0
            .run_mobile_plugin_async("watch", Watching { channel })
            .await
    }
}
